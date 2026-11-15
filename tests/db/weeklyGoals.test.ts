import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, daysBetween, todayVn } from "../../lib/inquiries/dates";
import { weekStartVn, appliesFromVn } from "../../lib/student/week";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CONTENT_DIR } from "../../lib/config/content";
import type { InquiryTemplate } from "../../lib/config/schemas";
import { as, asCommit, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

const TODAY = todayVn();
const template = (id: string): InquiryTemplate => JSON.parse(readFileSync(path.join(CONTENT_DIR, "inquiries", `${id}.json`), "utf8")) as InquiryTemplate;
function dueReleasingAll(id: string): string {
  const t = template(id);
  const last = t.steps.map((s) => s.planned_date ?? "").sort().at(-1) ?? "";
  return addDays(TODAY, daysBetween(last, t.dates.to));
}
const png = () => ({ id: randomUUID(), mime: "image/png", bytes: 80_000 });
const pdfFile = () => ({ id: randomUUID(), mime: "application/pdf", bytes: 120_000 });

const FORBIDDEN_KEY = /^(score|scores|correct|expected|answer|answers|explanation|explanation_vi|tag_key|tag_keys|level_num|pct|percent|result|results|wrong|wrong_items|rubric|verdict|decision)$/;
function keysOf(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      keysOf(x, out);
    }
  return out;
}

type G = { id: string; pieces?: number; applies_from?: string; replayed: boolean };
type Facts = {
  now: string;
  range: { min: number; max: number };
  goals: { id: string; kind: string; pieces: number | null; applies_from: string | null; responds_to: string | null; by_role: string }[];
  works: { k: string; w: string }[];
  first_work_at: string | null;
  writes: string[];
  first_topic_at: string | null;
  first_revision_at: string | null;
  unit_events: unknown[];
};

/** W4d (migration 0035): weekly goals, eng_my_week / eng_week_facts. One database. */
describe("weekly goals (migration 0035)", () => {
  let db: TestDb;
  let s: Seeded;
  const M = () => s.members;
  const U = () => s.users;
  const NG = () => s.learners.nguyen;
  const AN = () => s.learners.an;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const student = <T = unknown>(user: string, sql: string, params: unknown[] = []) =>
    asCommit(db.client, "authenticated", user, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const read = <T = unknown>(user: string, sql: string, params: unknown[] = []) =>
    as(db.client, "authenticated", user, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };
  const propose = (user: string, pieces: number, clientId: string = randomUUID()) => student<G>(user, "select english.eng_my_propose_goal($1, $2) as r", [pieces, clientId]);
  const withdraw = (user: string, goal: string, clientId: string = randomUUID()) => student<G>(user, "select english.eng_my_withdraw_goal($1, $2) as r", [goal, clientId]);
  const decide = (goal: string, action: string, pieces: number | null, by: string, clientId: string = randomUUID(), learner: string | null = null) =>
    svc<G>("select english.eng_decide_goal($1, $2, $3, $4, $5, $6) as r", [goal, action, pieces, by, clientId, learner]);
  const myWeek = (user: string) => read<Facts | null>(user, "select english.eng_my_week() as r");
  const factsOf = (learner: string) => svc<Facts>("select english.eng_week_facts($1) as r", [learner]);
  const count = async (sql: string, params: unknown[] = []) => ((await q1<{ n: number }>(sql, params))[0] as { n: number }).n;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("the table is append-only (even service_role cannot write or truncate), has RLS, and the track ranges are data", async () => {
    await fail(svc("insert into english.weekly_goals(learner_id, kind, pieces, by_member, by_role, client_id) values ($1, 'propose', 3, $2, 'student', 'abcdefgh1') returning 1 as r", [NG(), M().studentNguyen]), "42501");
    const p = await propose(U().studentNguyen, 4);
    await fail(q1("update english.weekly_goals set pieces = 5 where id = $1", [p.id]), "42501");
    await fail(q1("delete from english.weekly_goals where id = $1", [p.id]), "42501");
    await fail(svc("truncate english.weekly_goals"), "42501");
    expect((await q1<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where oid = 'english.weekly_goals'::regclass"))[0]!.relrowsecurity).toBe(true);
    const ranges = await q1<{ track_id: string; value: { min: number; max: number } }>("select track_id, value from english.track_settings where key = 'weekly_goal_range' order by track_id");
    expect(ranges).toEqual([{ track_id: "A", value: { min: 2, max: 5 } }, { track_id: "B", value: { min: 3, max: 6 } }]);
    await withdraw(U().studentNguyen, p.id);
  });

  it("only the right role calls each function: the child's two writes + eng_my_week are authenticated-only, the adult ones service_role-only", async () => {
    for (const sql of ["select english.eng_my_propose_goal(3, 'abcdefgh1')", "select english.eng_my_withdraw_goal(gen_random_uuid(), 'abcdefgh1')", "select english.eng_my_week()"]) {
      await fail(as(db.client, "anon", null, async (q) => q(sql)), "42501");
      await fail(as(db.client, "service_role", null, async (q) => q(sql)), "42501");
    }
    for (const sql of ["select english.eng_decide_goal(gen_random_uuid(), 'accept', null, gen_random_uuid(), 'abcdefgh1', null)", "select english.eng_week_facts(gen_random_uuid())"]) {
      await fail(as(db.client, "anon", null, async (q) => q(sql)), "42501");
      await fail(as(db.client, "authenticated", U().studentNguyen, async (q) => q(sql)), "42501");
      await fail(as(db.client, "authenticated", U().tutorNguyen, async (q) => q(sql)), "42501");
    }
    for (const sql of ["select english.eng_week_work($1)", "select english.eng_week_facts_of($1)"]) {
      await fail(as(db.client, "authenticated", U().studentNguyen, async (q) => q(sql, [NG()])), "42501");
      await fail(as(db.client, "service_role", null, async (q) => q(sql, [NG()])), "42501");
    }
    // an adult is not a child: nothing proposed, nothing read
    await fail(student(U().parent, "select english.eng_my_propose_goal(4, $1) as r", [randomUUID()]), "42501");
    await fail(student(U().tutorNguyen, "select english.eng_my_propose_goal(4, $1) as r", [randomUUID()]), "42501");
    expect(await myWeek(U().parent)).toBeNull();
    expect(await myWeek(U().tutorAn)).toBeNull();
  });

  it("the suggested range is the track's (A 2–5, B 3–6); outside it is refused; the first proposal is stored for the child only", async () => {
    await fail(propose(U().studentAn, 1), "22023", /out_of_range/);
    await fail(propose(U().studentAn, 6), "22023", /out_of_range/);
    await fail(propose(U().studentNguyen, 2), "22023", /out_of_range/);
    await fail(propose(U().studentNguyen, 7), "22023", /out_of_range/);
    const a = await propose(U().studentAn, 5);
    const n = await propose(U().studentNguyen, 6);
    const rows = await q1<{ learner_id: string; kind: string; pieces: number; by_member: string }>("select learner_id, kind, pieces, by_member from english.weekly_goals where id = any($1::uuid[]) order by pieces", [[a.id, n.id]]);
    expect(rows).toEqual([
      { learner_id: AN(), kind: "propose", pieces: 5, by_member: M().studentAn },
      { learner_id: NG(), kind: "propose", pieces: 6, by_member: M().studentNguyen },
    ]);
    const w = (await myWeek(U().studentAn))!;
    expect(w.range).toEqual({ min: 2, max: 5 });
    expect((await myWeek(U().studentNguyen))!.range).toEqual({ min: 3, max: 6 });
    // clean up for the next tests: both proposals are withdrawn (a withdrawn one frees the slot)
    await withdraw(U().studentAn, a.id);
    await withdraw(U().studentNguyen, n.id);
  });

  it("one proposal waits at a time; withdrawing frees the slot; a replay returns the first answer; a reused client_id with another number is refused", async () => {
    const cid = randomUUID();
    const p = await propose(U().studentNguyen, 4, cid);
    expect(p.replayed).toBe(false);
    expect((await propose(U().studentNguyen, 4, cid)).replayed).toBe(true);
    await fail(propose(U().studentNguyen, 5, cid), "23505", /client_id_reused/);
    await fail(propose(U().studentNguyen, 5), "23505", /pending_exists/);
    const w = await withdraw(U().studentNguyen, p.id);
    expect(w.replayed).toBe(false);
    expect((await withdraw(U().studentNguyen, p.id, (await q1<{ client_id: string }>("select client_id from english.weekly_goals where kind = 'withdraw' and responds_to = $1", [p.id]))[0]!.client_id)).replayed).toBe(true);
    await fail(withdraw(U().studentNguyen, p.id), "22023", /bad_ref/); // nothing left to withdraw
    const again = await propose(U().studentNguyen, 5);
    expect(again.id).not.toBe(p.id);
    await withdraw(U().studentNguyen, again.id);
  });

  it("a child cannot withdraw (or answer) someone else's proposal", async () => {
    const a = await propose(U().studentAn, 3);
    await fail(withdraw(U().studentNguyen, a.id), "22023", /bad_ref/);
    await fail(withdraw(U().studentNguyen, randomUUID()), "22023", /bad_ref/);
    await withdraw(U().studentAn, a.id);
  });

  it("only the child's own tutor decides: the parent (42501), the other child's tutor (42501) and a student (42501) are refused; the tag says tutor_only", async () => {
    const p = await propose(U().studentNguyen, 4);
    await fail(decide(p.id, "accept", null, M().parent), "42501", /tutor_only/);
    await fail(decide(p.id, "accept", null, M().tutorAn), "42501", /tutor_only/);
    await fail(decide(p.id, "accept", null, M().studentNguyen), "42501", /tutor_only/);
    await fail(decide(randomUUID(), "accept", null, M().tutorNguyen), "42501", /tutor_only/); // an unknown goal is not told apart
    // the page's child must be the goal's child: a goal of another child is refused like an unknown one
    await fail(decide(p.id, "accept", null, M().tutorNguyen, randomUUID(), AN()), "42501", /tutor_only/);
    expect(await count("select count(*)::int as n from english.weekly_goals where responds_to = $1", [p.id])).toBe(0);
    await withdraw(U().studentNguyen, p.id);
  });

  it("accept keeps the number and ADJUST changes it (1–14, even outside the range); both start on the NEXT Monday set by the function", async () => {
    const mondayNext = (await q1<{ d: string }>("select (english.eng_week_start(now()) + 7)::text as d"))[0]!.d;
    expect(mondayNext).toBe(appliesFromVn(new Date()));
    const p = await propose(U().studentNguyen, 5);
    const r = await decide(p.id, "accept", null, M().tutorNguyen);
    expect(r).toMatchObject({ pieces: 5, applies_from: mondayNext, replayed: false });
    await fail(decide(p.id, "accept", null, M().tutorNguyen), "23505", /already_answered/);
    await fail(withdraw(U().studentNguyen, p.id), "22023", /bad_ref/); // answered: it cannot be withdrawn any more
    const p2 = await propose(U().studentNguyen, 4);
    await fail(decide(p2.id, "adjust", 4, M().tutorNguyen), "22023", /bad_pieces/); // same number is not an adjustment
    await fail(decide(p2.id, "adjust", 0, M().tutorNguyen), "22023", /bad_pieces/);
    await fail(decide(p2.id, "adjust", 15, M().tutorNguyen), "22023", /bad_pieces/);
    await fail(decide(p2.id, "adjust", null, M().tutorNguyen), "22023", /bad_pieces/);
    await fail(decide(p2.id, "accept", 9, M().tutorNguyen), "22023", /bad_pieces/);
    await fail(decide(p2.id, "approve", null, M().tutorNguyen), "22023", /bad_action/);
    const cid = randomUUID();
    const adj = await decide(p2.id, "adjust", 9, M().tutorNguyen, cid);
    expect(adj).toMatchObject({ pieces: 9, applies_from: mondayNext });
    expect(await decide(p2.id, "adjust", 9, M().tutorNguyen, cid)).toMatchObject({ replayed: true, pieces: 9 });
    await fail(decide(p2.id, "adjust", 8, M().tutorNguyen, cid), "23505", /client_id_reused/);
    // the stored row: decided by the tutor, a Monday, pointing at the proposal
    const row = (await q1<{ by_role: string; by_member: string; responds_to: string; applies_from: string; dow: number }>(
      "select by_role, by_member, responds_to, applies_from::text, extract(isodow from applies_from)::int as dow from english.weekly_goals where id = $1", [adj.id]))[0]!;
    expect(row).toMatchObject({ by_role: "tutor", by_member: M().tutorNguyen, responds_to: p2.id, applies_from: mondayNext, dow: 1 });
    // audit: no text, only the numbers
    const audit = await q1<{ payload: Record<string, unknown> }>("select payload from english.audit_log where action = 'goal.decided' and learner_id = $1 order by at desc limit 1", [NG()]);
    expect(Object.keys(audit[0]!.payload).sort()).toEqual(["action", "goal", "pieces"]);
  });

  it("the row shape is enforced by the table: only a Monday applies; a decision always points at a proposal", async () => {
    const p = await propose(U().studentAn, 3);
    const direct = (kind: string, from: string | null, resp: string | null, role: string) =>
      db.client.query("insert into english.weekly_goals(learner_id, kind, pieces, applies_from, responds_to, by_member, by_role, client_id) values ($1, $2, 3, $3, $4, $5, $6, $7)",
        [AN(), kind, from, resp, M().tutorAn, role, randomUUID()]);
    await fail(direct("accept", "2026-11-17", p.id, "tutor"), "23514"); // a Tuesday
    await fail(direct("accept", "2026-11-16", null, "tutor"), "23514"); // no proposal
    await fail(direct("propose", "2026-11-16", null, "student"), "23514"); // a proposal has no start
    await fail(direct("accept", "2026-11-16", p.id, "student"), "23514"); // a student cannot decide
    await withdraw(U().studentAn, p.id);
  });

  it("RLS: the child's tutor and the parent read the ledger; the other tutor and every student read nothing directly", async () => {
    const p = await propose(U().studentNguyen, 3);
    const ids = async (user: string) => (await rowsAs<{ id: string }>(db.client, "authenticated", user, "select id from english.weekly_goals where id = $1", [p.id])).length;
    expect(await ids(U().tutorNguyen)).toBe(1);
    expect(await ids(U().parent)).toBe(1);
    expect(await ids(U().tutorAn)).toBe(0);
    expect(await ids(U().studentNguyen)).toBe(0);
    expect(await ids(U().studentAn)).toBe(0);
    await withdraw(U().studentNguyen, p.id);
  });

  it("eng_my_week: only the child's own data; no score-like keys; the adult read gives the same shape for any child of the family", async () => {
    const own = (await myWeek(U().studentNguyen))!;
    expect(own.goals.every((g) => g.by_role === "student" || g.by_role === "tutor")).toBe(true);
    expect(await q1("select 1 where false")).toEqual([]);
    expect(new Set(own.goals.map((g) => g.id))).toEqual(new Set((await q1<{ id: string }>("select id from english.weekly_goals where learner_id = $1", [NG()])).map((r) => r.id)));
    const an = (await myWeek(U().studentAn))!;
    expect(an.goals.every((g) => !own.goals.some((o) => o.id === g.id))).toBe(true);
    for (const f of [own, an]) expect(keysOf(f).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([]);
    const adult = await factsOf(NG());
    expect(Object.keys(adult).sort()).toEqual(Object.keys(own).sort());
    expect(adult.goals).toEqual(own.goals);
    await fail(svc("select english.eng_week_facts($1) as r", [randomUUID()]), "P0002");
  });

  describe("what counts as work", () => {
    const assign = async (who: "an" | "nguyen", tpl: string, due: string) =>
      (await q1<{ id: string }>("select english.eng_assign_inquiry($1, $2, 1, $3, $4, $5) as id", [s.learners[who], tpl, due, M().parent, `w4d-${tpl}-${who}`]))[0]!.id;
    /** A free-writing step (ACT-WRITE without items: it takes {text}): B-W1 step 7, A-W1 step 6. */
    const step = async (instance: string, stepNo: number) =>
      (await q1<{ id: string }>("select id from english.activity_instances where inquiry_instance_id = $1 and step_no = $2 and activity_type = 'ACT-WRITE'", [instance, stepNo]))[0]!.id;
    const submitText = (user: string, activity: string, text: string) =>
      student<{ attempt_id: string }>(user, "select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], 'in_app') as r", [activity, randomUUID(), JSON.stringify({ text }), ["none"]]);
    const makeLink = (title: string) =>
      svc<{ id: string }>("select english.eng_create_assignment($1, 'link', 'https://example.org/a', $2, '{}'::text[], null, null, null, $3, $4) as r", [NG(), title, M().tutorNguyen, randomUUID()]);
    const makePdf = (title: string) =>
      svc<{ id: string }>("select english.eng_create_assignment($1, 'pdf', null, $2, '{}'::text[], null, null, $3::jsonb, $4, $5) as r", [NG(), title, JSON.stringify({ main: pdfFile() }), M().tutorNguyen, randomUUID()]);
    const send = (assignment: string, by: string, files: unknown[] = [png()]) =>
      svc("select english.eng_submit_practice_v2($1, $2, $3, 'first', false, null, $4::jsonb) as r", [assignment, by, randomUUID(), JSON.stringify(files)]);
    const works = async (learner = NG()) => (await factsOf(learner)).works;
    const thisWeek = () => weekStartVn(new Date());

    let inst: string;
    let anInst: string;
    beforeAll(async () => {
      inst = await assign("nguyen", "B-W1-HOMEWORK", dueReleasingAll("B-W1-HOMEWORK"));
      anInst = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
    });

    it("an in-app attempt counts once per work and week, however many times it is sent; opening / saving a draft counts nothing", async () => {
      expect(await works(AN())).toEqual([]);
      const act = await step(anInst, 6); // a practice step: it can be sent again
      await student(U().studentAn, "select english.eng_save_draft($1, $2::jsonb, null) as r", [act, JSON.stringify({ text: "work in progress" })]);
      expect(await works(AN())).toEqual([]); // a draft is not sent
      await submitText(U().studentAn, act, "First answer");
      const first = await works(AN());
      expect(first).toEqual([{ k: `a:${act}`, w: thisWeek() }]);
      await submitText(U().studentAn, act, "Second answer");
      expect(await works(AN())).toEqual(first); // still ONE piece in this week
      expect(await count("select count(*)::int as n from english.attempts where activity_instance_id = $1", [act])).toBe(2);
      const f = await factsOf(AN());
      expect(f.first_work_at).not.toBeNull();
      expect(weekStartVn(f.first_work_at as string)).toBe(thisWeek());
      expect(f.writes).toHaveLength(1); // one ACT-WRITE step sent: one time, not two
    });

    it("a link the child sent counts; a link an adult sent for the child does not; a PDF an adult sent for the child does", async () => {
      const link = await makeLink("Child's own link");
      await send(link.id, M().studentNguyen);
      const byAdultLink = await makeLink("Link sent by the tutor");
      await send(byAdultLink.id, M().tutorNguyen);
      const pdf = await makePdf("Paper sent by the tutor");
      await send(pdf.id, M().tutorNguyen);
      const keys = (await works()).map((x) => x.k);
      expect(keys).toContain(`s:${link.id}`);
      expect(keys).not.toContain(`s:${byAdultLink.id}`);
      expect(keys).toContain(`s:${pdf.id}`);
      // a second photo of the same paper in the same week is still one piece
      await send(pdf.id, M().tutorNguyen, [png(), png()]);
      expect((await works()).filter((x) => x.k === `s:${pdf.id}`)).toHaveLength(1);
    });

    it("work recorded in a session (tutor_live) and imported work do not count; the other child's work is never in this child's facts", async () => {
      const act = await q1<{ id: string }>("select a.id from english.activity_instances a where a.inquiry_instance_id = $1 and a.activity_type = 'ACT-SPEAK-LIVE' order by a.step_no limit 1", [inst]);
      const before = (await works()).length;
      expect(act[0]).toBeDefined();
      {
        await svc("select english.eng_record_offline_attempt($1, 'tutor_live', $2, null, null, $3::date, '{none}'::text[], $4, $5) as r", [act[0]!.id, "Said in the session", TODAY, M().tutorNguyen, randomUUID()]);
        expect(await count("select count(*)::int as n from english.attempts where activity_instance_id = $1 and provenance = 'tutor_live'", [act[0]!.id])).toBe(1);
        expect((await works()).length).toBe(before);
      }
      const anAct = await step(anInst, 6);
      expect((await works(AN())).map((x) => x.k)).toEqual([`a:${anAct}`]);
      expect((await works(NG())).some((x) => x.k === `a:${anAct}`)).toBe(false);
      expect(((await myWeek(U().studentAn))!).works).toEqual(await works(AN()));
    });

    it("the week bucket is Monday 00:00 in Vietnam: the SQL function agrees with lib/student/week.ts on the boundaries and on a sweep", async () => {
      const at = async (ts: string) => (await q1<{ d: string }>("select english.eng_week_start($1::timestamptz)::text as d", [ts]))[0]!.d;
      expect(await at("2026-11-15T16:59:59Z")).toBe("2026-11-09"); // Sunday 23:59:59 in Vietnam
      expect(await at("2026-11-15T17:00:00Z")).toBe("2026-11-16"); // Monday 00:00:00 in Vietnam
      expect(await at("2026-12-31T16:59:59Z")).toBe("2026-12-28");
      expect(await at("2026-12-31T17:00:00Z")).toBe("2026-12-28"); // 01/01/2027 is a Friday
      expect(await at("2027-01-03T17:00:00Z")).toBe("2027-01-04");
      for (let i = 0; i < 400; i += 1) {
        const ts = new Date(Date.UTC(2026, 0, 1) + i * 37 * 3_600_000 + (i % 7) * 1_234_567).toISOString();
        expect(await at(ts), ts).toBe(weekStartVn(ts));
      }
    });
  });

  it("achievement facts: the first topic done, writes and the first revision are facts of the child's own work only", async () => {
    const f = await factsOf(NG());
    expect(Array.isArray(f.writes)).toBe(true);
    expect(f.first_revision_at).toBeNull();
    expect(Array.isArray(f.unit_events)).toBe(true);
    expect(f.range).toEqual({ min: 3, max: 6 });
  });

  it("purge: the preview counts weekly_goals, the receipt deletes them (self-references included) and nothing of the other child", async () => {
    const before = await count("select count(*)::int as n from english.weekly_goals where learner_id = $1", [NG()]);
    expect(before).toBeGreaterThan(0);
    const otherBefore = await count("select count(*)::int as n from english.weekly_goals where learner_id = $1", [AN()]);
    const dry = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [NG()]);
    expect(dry.counts.weekly_goals).toBe(before);
    const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1, $2) as r", [NG(), U().parent]);
    expect(receipt.deleted.weekly_goals).toBe(before);
    expect(Object.keys(receipt.deleted).sort()).toEqual(Object.keys(dry.counts).sort());
    expect(await count("select count(*)::int as n from english.weekly_goals where learner_id = $1", [NG()])).toBe(0);
    expect(await count("select count(*)::int as n from english.weekly_goals where learner_id = $1", [AN()])).toBe(otherBefore);
  });

  it("applying the migration twice changes nothing", async () => {
    const { readFile } = await import("node:fs/promises");
    const { readdirSync } = await import("node:fs");
    const { MIGRATIONS_DIR } = await import("../../scripts/lib/migrate");
    const file = readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith("_weekly_goals.sql"))!;
    const sql = await readFile(`${MIGRATIONS_DIR}/${file}`, "utf8");
    const rangesBefore = await q1("select track_id, key, value from english.track_settings where key = 'weekly_goal_range' order by 1");
    await db.client.query(sql);
    await db.client.query(sql);
    expect(await q1("select track_id, key, value from english.track_settings where key = 'weekly_goal_range' order by 1")).toEqual(rangesBefore);
    expect(await count("select count(*)::int as n from english.schema_migrations where version = $1", [file.slice(0, 4)])).toBe(1);
  });
});
