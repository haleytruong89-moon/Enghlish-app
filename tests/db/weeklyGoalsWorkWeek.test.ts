import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWeekView } from "../../lib/student/weekView";
import { parseWeekFacts } from "../../lib/student/weekShape";
import { addDays, weekStartVn } from "../../lib/student/week";
import { asCommit, createTestDb, migrate, seed, type Seeded, type TestDb } from "./helpers";

const png = () => ({ id: randomUUID(), mime: "image/png", bytes: 80_000 });
const pdfFile = () => ({ id: randomUUID(), mime: "application/pdf", bytes: 120_000 });

/** W4d (migration 0035): "Tuần làm bài" of paper work an adult sends for the child, and "Bài đầu tiên" from the child's own work only. A fresh database. */
describe("weekly goal · work week of an adult upload", () => {
  let db: TestDb;
  let s: Seeded;
  const M = () => s.members;
  const AN = () => s.learners.an;
  const NG = () => s.learners.nguyen;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };
  const choice = async (at: string, c: string) => ((await q1<{ r: string | null }>("select english.eng_work_week_choice($1::timestamptz, $2)::text as r", [at, c]))[0] as { r: string | null }).r;
  const pdf = (learner: string, by: string) =>
    svc<{ id: string }>("select english.eng_create_assignment($1, 'pdf', null, $2, '{}'::text[], null, null, $3::jsonb, $4, $5) as r", [learner, "Paper", JSON.stringify({ main: pdfFile() }), by, randomUUID()]);
  const link = (learner: string, by: string) =>
    svc<{ id: string }>("select english.eng_create_assignment($1, 'link', 'https://example.org/a', 'A link', '{}'::text[], null, null, null, $2, $3) as r", [learner, by, randomUUID()]);
  type V3 = { id: string; replayed: boolean; work_week: string | null };
  const v3 = (assignment: string, by: string, week: string, clientId: string = randomUUID(), hint: boolean | null = false, files: unknown[] = [png()]) =>
    svc<V3>("select english.eng_submit_practice_v3($1, $2, $3, 'first', $4, null, $5::jsonb, $6) as r", [assignment, by, clientId, hint, JSON.stringify(files), week]);
  const view = async (learner: string) => buildWeekView(parseWeekFacts((await svc<unknown>("select english.eng_week_facts($1) as r", [learner])))!);
  const thisMonday = () => weekStartVn(new Date());
  const vnIsoDow = () => ((new Date(Date.now() + 7 * 3600e3).getUTCDay() + 6) % 7) + 1;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("last week can be chosen only on Monday and Tuesday (Vietnam time): the boundaries to the minute", async () => {
    expect(await choice("2026-11-15T16:59:59Z", "last").catch((e: { code: string }) => e.code)).toBe("22023"); // Sunday 23:59:59 VN
    expect(await choice("2026-11-15T17:00:00Z", "last")).toBe("2026-11-09"); // Monday 00:00 VN
    expect(await choice("2026-11-17T16:59:59Z", "last")).toBe("2026-11-09"); // Tuesday 23:59:59 VN
    expect(await choice("2026-11-17T17:00:00Z", "last").catch((e: { code: string; message: string }) => `${e.code} ${/work_week_closed/.test(e.message)}`)).toBe("22023 true"); // Wednesday 00:00 VN
    expect(await choice("2026-11-20T05:00:00Z", "this")).toBeNull();
    expect(await choice("2026-11-16T05:00:00Z", "next").catch((e: { message: string }) => /bad_work_week/.test(e.message))).toBe(true);
    // a year change: Monday 2027-01-04 → last week started 2026-12-28
    expect(await choice("2027-01-04T05:00:00Z", "last")).toBe("2026-12-28");
  });

  it("v3: only adults, only paper (not a link), a replay must repeat the choice; a child's own submission is untouched", async () => {
    const paper = await pdf(NG(), M().tutorNguyen);
    // the actor is checked first: a child cannot choose, whatever the day
    await fail(v3(paper.id, M().studentNguyen, "last"), "22023", /work_week_adults_only/);
    expect(await q1("select 1 from english.submissions where assignment_id = $1", [paper.id])).toHaveLength(0); // rolled back with the refusal
    await fail(v3(paper.id, M().tutorNguyen, "next"), "22023", /bad_work_week/);
    const links = await link(NG(), M().tutorNguyen);
    await fail(v3(links.id, M().tutorNguyen, "last"), "22023", /work_week_not_counted/);
    // the other child's tutor is refused like before (the v2 checks run first)
    await fail(v3(paper.id, M().tutorAn, "this"), "42501");
    // "this" = no side row, work_week null
    const cid = randomUUID();
    const files = [png()];
    const a = await v3(paper.id, M().tutorNguyen, "this", cid, null, files);
    expect(a).toMatchObject({ replayed: false, work_week: null });
    expect(await q1("select 1 from english.submission_work_weeks where submission_id = $1", [a.id])).toHaveLength(0);
    // the same client id with another choice is a different submission
    await fail(v3(paper.id, M().tutorNguyen, "last", cid, null, files), "23505", /client_id_reused/);
    expect(await v3(paper.id, M().tutorNguyen, "this", cid, null, files)).toMatchObject({ id: a.id, replayed: true });
    // the child's own submission: counts in the week it was sent
    const own = await pdf(NG(), M().tutorNguyen);
    await v3(own.id, M().studentNguyen, "this");
    const works = (await svc<{ works: { k: string; w: string }[] }>("select english.eng_week_facts($1) as r", [NG()])).works;
    expect(works.find((x) => x.k === `s:${own.id}`)?.w).toBe(thisMonday());
  });

  it("v3 'last' end to end follows the real clock: on Monday / Tuesday it stores last week's Monday, any other day it is refused (work_week_closed) and nothing is stored", async () => {
    const paper = await pdf(NG(), M().tutorNguyen);
    const attempt = v3(paper.id, M().parent, "last");
    if (vnIsoDow() <= 2) {
      const r = await attempt;
      expect(r.work_week).toBe(addDays(thisMonday(), -7));
      const row = (await q1<{ work_week: string; learner_id: string }>("select work_week::text, learner_id from english.submission_work_weeks where submission_id = $1", [r.id]))[0]!;
      expect(row).toMatchObject({ work_week: addDays(thisMonday(), -7), learner_id: NG() });
    } else {
      await fail(attempt, "22023", /work_week_closed/);
      expect(await q1("select 1 from english.submissions where assignment_id = $1", [paper.id])).toHaveLength(0);
    }
  });

  it("the side table is append-only and the child cannot read it", async () => {
    const paper = await pdf(NG(), M().tutorNguyen);
    const r = await v3(paper.id, M().tutorNguyen, "this");
    await db.client.query("insert into english.submission_work_weeks(submission_id, learner_id, work_week, by_member) values ($1, $2, $3::date, $4)", [r.id, NG(), addDays(thisMonday(), -7), M().tutorNguyen]);
    await fail(db.client.query("update english.submission_work_weeks set work_week = $2::date where submission_id = $1", [r.id, thisMonday()]), "42501");
    await fail(db.client.query("insert into english.submission_work_weeks(submission_id, learner_id, work_week, by_member) values ($1, $2, $3::date, $4)", [paper.id, NG(), "2026-11-10", M().tutorNguyen]), "23514"); // not a Monday
    const seen = await asCommit(db.client, "authenticated", s.users.studentNguyen, async (q) => (await q("select 1 from english.submission_work_weeks")).rows.length);
    expect(seen).toBe(0);
  });

  it("Sunday's work uploaded on Monday as 'Tuần trước' counts for last week and the streak holds (An, goal 1 a week)", async () => {
    const monday = thisMonday();
    // a goal of 1 piece a week that started 3 weeks ago, and the child's own link work in weeks -3 and -2
    const prop = (await q1<{ id: string }>(
      "insert into english.weekly_goals(learner_id, kind, pieces, by_member, by_role, client_id) values ($1, 'propose', 1, $2, 'student', $3) returning id",
      [AN(), M().studentAn, randomUUID()],
    ))[0]!.id;
    await db.client.query(
      "insert into english.weekly_goals(learner_id, kind, pieces, applies_from, responds_to, by_member, by_role, client_id) values ($1, 'accept', 1, $2::date, $3, $4, 'tutor', $5)",
      [AN(), addDays(monday, -21), prop, M().tutorAn, randomUUID()],
    );
    for (const back of [21, 14]) {
      const a = (await q1<{ id: string }>(
        "insert into english.assignments(learner_id, kind, url, source_key, title, assigned_by_member, client_id) values ($1, 'link', 'https://example.org/x', 'other', 'Own', $2, $3) returning id",
        [AN(), M().tutorAn, randomUUID()],
      ))[0]!.id;
      await db.client.query(
        "insert into english.submissions(assignment_id, learner_id, attempt, link_url, submitted_by_member, submitted_by_role, client_id, created_at) values ($1, $2, 'first', 'https://example.org/x', $3, 'student', $4, $5::date + interval '11 hours')",
        [a, AN(), M().studentAn, randomUUID(), addDays(monday, -back)],
      );
    }
    const before = await view(AN());
    expect(before.streak).toBe(0 + 0); // weeks -3 and -2 met, last week not yet: the streak counts back from last week = 0
    // the adult uploads Sunday's paper work now; chosen "this week" it would count in the running week (the old reading)
    const paper = await pdf(AN(), M().tutorAn);
    const r = await svc<V3>("select english.eng_submit_practice_v2($1, $2, $3, 'first', false, null, $4::jsonb) as r", [paper.id, M().tutorAn, randomUUID(), JSON.stringify([png()])]);
    const thisWeekReading = await view(AN());
    expect(thisWeekReading.count).toBe(1);
    expect(thisWeekReading.streak).toBe(1); // last week unmet → 0, the running week is met → +1
    // "Tuần trước": the same upload belongs to last week (what v3 stores on Monday / Tuesday)
    await db.client.query("insert into english.submission_work_weeks(submission_id, learner_id, work_week, by_member) values ($1, $2, $3::date, $4)", [r.id, AN(), addDays(monday, -7), M().tutorAn]);
    const after = await view(AN());
    expect(after.count).toBe(0);
    expect(after.streak).toBe(3); // weeks -3, -2 and last week
    expect(after.met).toBe(false); // the running week has nothing yet and never breaks the streak
  });

  it("'Bài đầu tiên' comes only from the child's own work: an adult's upload never opens it", async () => {
    // Nguyên's own work so far: the child's own pdf of an earlier test; Nguyên's adult uploads happened too. An: own link work 3 weeks ago.
    const facts = await svc<{ first_work_at: string | null }>("select english.eng_week_facts($1) as r", [AN()]);
    const ownFirst = (await q1<{ t: string }>("select min(created_at)::text as t from english.submissions where learner_id = $1 and submitted_by_role = 'student'", [AN()]))[0]!.t;
    expect(Date.parse(facts.first_work_at as string)).toBe(Date.parse(ownFirst));
    // an adult upload placed ten weeks back (its "Tuần làm bài" row) is the OLDEST work, yet it does not move the child's first work
    const paper = await pdf(AN(), M().tutorAn);
    const r = await svc<V3>("select english.eng_submit_practice_v2($1, $2, $3, 'first', false, null, $4::jsonb) as r", [paper.id, M().parent, randomUUID(), JSON.stringify([png()])]);
    await db.client.query("insert into english.submission_work_weeks(submission_id, learner_id, work_week, by_member) values ($1, $2, $3::date, $4)", [r.id, AN(), addDays(thisMonday(), -70), M().parent]);
    const again = await svc<{ first_work_at: string | null; works: { k: string; w: string }[] }>("select english.eng_week_facts($1) as r", [AN()]);
    expect(again.first_work_at).toBe(facts.first_work_at);
  });
});
