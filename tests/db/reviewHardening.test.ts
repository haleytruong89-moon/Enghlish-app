import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../../lib/config/content";
import type { InquiryTemplate } from "../../lib/config/schemas";
import { addDays, daysBetween, todayVn } from "../../lib/inquiries/dates";
import { as, asCommit, createTestDb, migrate, seed, type Seeded, type TestDb } from "./helpers";

/**
 * S5 hardening after the Opus review: who may record work outside the app, the inbox at scale, backdated records, what the student
 * can read, tutor-live criteria, the support-note limit, and the races between two people acting on the same piece of work.
 * (The broad S5 behaviour is in review.test.ts; this file has its own database so it can add many rows.)
 */
const TODAY = todayVn();
const YESTERDAY = addDays(TODAY, -1);

const template = (id: string): InquiryTemplate =>
  JSON.parse(readFileSync(path.join(CONTENT_DIR, "inquiries", `${id}.json`), "utf8")) as InquiryTemplate;
function dueReleasing(id: string, stepNo: number): string {
  const planned = template(id).steps[stepNo - 1]?.planned_date;
  if (!planned) throw new Error("step has no planned date");
  return addDays(TODAY, daysBetween(planned, template(id).dates.to));
}
function dueReleasingAll(id: string): string {
  const t = template(id);
  const last = t.steps.map((s) => s.planned_date ?? "").sort().at(-1) ?? "";
  return addDays(TODAY, daysBetween(last, t.dates.to));
}

describe("S5 hardening (Opus review)", () => {
  let db: TestDb;
  let s: Seeded;
  const M = () => s.members;

  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const count = async (sql: string, params: unknown[] = []) => ((await q1<{ n: number }>(sql, params))[0] as { n: number }).n;
  let seq = 0;
  async function assign(who: "an" | "nguyen", templateId: string, due = dueReleasingAll(templateId)): Promise<string> {
    const r = await q1<{ id: string }>("select english.eng_assign_inquiry($1, $2, 1, $3, $4, $5) as id", [
      s.learners[who], templateId, due, s.members.parent, `s5h-${(seq += 1)}-${templateId}`,
    ]);
    return (r[0] as { id: string }).id;
  }
  async function activity(instance: string, stepNo: number): Promise<string> {
    return ((await q1<{ id: string }>("select id from english.activity_instances where inquiry_instance_id = $1 and step_no = $2", [instance, stepNo]))[0] as { id: string }).id;
  }
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  type Offline = { attempt_id: string; episode_id: string; attempt_no: number; submitted_at: string; replayed: boolean };
  const offline = (by: string, activityId: string, provenance: string, text: string, opts: { date?: string; assistance?: string[]; clientId?: string } = {}) =>
    svc<Offline>("select english.eng_record_offline_attempt($1, $2, $3, null, null, $4::date, $5::text[], $6, $7) as r", [
      activityId, provenance, text, opts.date ?? TODAY, opts.assistance ?? ["none"], by, opts.clientId ?? randomUUID(),
    ]);
  const rpcAs = <T = unknown>(userId: string | null, sql: string, params: unknown[] = []) =>
    as(db.client, "authenticated", userId, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  type Row = { episode_id: string; learner_id: string; can_decide: boolean; targets_total: number; targets_decided: number; category: string; submitted_at: string };
  type Page = { items: Row[]; next: { at: string; id: string } | null; counts: Record<string, number> };
  const inboxPage = (userId: string, filter = "todo", limit = 50, after: { at: string; id: string } | null = null) =>
    rpcAs<Page>(userId, "select english.eng_review_inbox(false, $1, $2, $3, $4) as r", [filter, limit, after?.at ?? null, after?.id ?? null]);
  /** Walk a filter page by page; returns every row in the order the database gave them, and how many pages it took. */
  async function walk(userId: string, filter: string, limit: number): Promise<{ rows: Row[]; pages: number; counts: Record<string, number> }> {
    const rows: Row[] = [];
    let after: { at: string; id: string } | null = null;
    let pages = 0;
    let counts: Record<string, number> = {};
    do {
      const page: Page = await inboxPage(userId, filter, limit, after);
      rows.push(...page.items);
      counts = page.counts;
      after = page.next;
      pages += 1;
    } while (after);
    return { rows, pages, counts };
  }
  type Receipt = { attempt_id: string; attempt_no: number };
  const submitAs = (userId: string, activityId: string, content: unknown, assistance: string[] = ["none"]) =>
    asCommit(db.client, "authenticated", userId, async (q) => {
      const r = await q("select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], 'in_app') as r", [activityId, randomUUID(), JSON.stringify(content), assistance]);
      return (r.rows[0] as { r: Receipt }).r;
    });
  const review = (by: string, episode: string, target: string, score: number | null, opts: { notObserved?: boolean; criteria?: unknown; clientId?: string } = {}) =>
    svc<{ decision_id: string }>("select english.eng_record_review($1, $2, $3::smallint, $4, $5::jsonb, null, $6, $7) as r", [
      episode, target, score, opts.notObserved ?? false, opts.criteria === undefined ? null : JSON.stringify(opts.criteria), by, opts.clientId ?? randomUUID(),
    ]);
  /**
   * A piece of work that is NOT watched live on a step the app only lets the tutor record live (so the app can no longer make it).
   * Built with the same helpers the app uses, as the table owner; used to check the database's own rules stay true by themselves.
   */
  async function unwatchedEpisode(activityId: string): Promise<{ attemptId: string; episodeId: string }> {
    const id = randomUUID();
    const [a] = await q1<{ learner_id: string; target_ids: string[]; purpose: string[]; mode: string; template: string }>(
      "select a.learner_id, a.target_ids, a.purpose, a.mode, i.snapshot->'template'->>'id' as template from english.activity_instances a join english.inquiry_instances i on i.id = a.inquiry_instance_id where a.id = $1", [activityId]);
    const row = a as { learner_id: string; target_ids: string[]; purpose: string[]; mode: string; template: string };
    await db.client.query(
      `insert into english.attempts(id, activity_instance_id, learner_id, attempt_no, parent_attempt_id, learning_family_id, mode, provenance, declared_assistance, content_hash, client_submission_id)
       values ($1, $2, $3, 1, null, $1, $4, 'manual_import', array['unknown'], repeat('b', 64), gen_random_uuid())`,
      [id, activityId, row.learner_id, row.mode]);
    await db.client.query(
      "insert into english.artifact_versions(attempt_id, learner_id, kind, version, content, is_raw, created_by) values ($1, $2, 'text', 1, '{\"text\":\"Paper note\"}'::jsonb, true, $3)",
      [id, row.learner_id, M().tutorNguyen]);
    await db.client.query("select english.eng_record_attempt_effects($1, $2, $3::text[], $4::text[], $5, 1, true, now(), false)", [id, row.learner_id, row.target_ids, row.purpose, row.template]);
    return { attemptId: id, episodeId: await episodeOf(id) };
  }
  const episodeOf = async (attemptId: string) =>
    ((await q1<{ id: string }>("select id from english.episodes where attempt_id = $1", [attemptId]))[0] as { id: string }).id;
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };

  let aW0: string; // An, baseline
  let aW1: string; // An, volcanoes

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    aW0 = await assign("an", "A-W0-BASELINE");
    aW1 = await assign("an", "A-W1-VOLCANOES");
  });
  afterAll(async () => {
    await db?.drop();
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("work recorded outside the app on a checkpoint step or a live speaking step is the tutor's alone", () => {
    it("a parent cannot record A-W0 step 8 (live speaking, baseline) or A-W1 step 8 (checkpoint) - with either kind of record", async () => {
      for (const act of [await activity(aW0, 8), await activity(aW1, 8)]) {
        await fail(offline(M().parent, act, "manual_import", "Paper note"), "42501", /D15/);
        await fail(offline(M().parent, act, "tutor_live", "I watched"), "42501");
        expect(await count("select count(*)::int as n from english.attempts where activity_instance_id = $1", [act])).toBe(0);
      }
    });

    it("the tutor records them: a live speaking step only as tutor_live; a checkpoint on paper is allowed for the tutor", async () => {
      const w0s8 = await activity(aW0, 8); // ACT-SPEAK-LIVE
      await fail(offline(M().tutorAn, w0s8, "manual_import", "Paper note"), "22023", /tutor_live/);
      const live = await offline(M().tutorAn, w0s8, "tutor_live", "An answered three questions in a row");
      expect(live).toMatchObject({ attempt_no: 1, replayed: false });
      expect(await q1("select observed_directly from english.episodes where attempt_id = $1", [live.attempt_id])).toEqual([{ observed_directly: true }]);

      const w1s8 = await activity(aW1, 8); // ACT-SPEAK-MONO + checkpoint, not a live step
      const onPaper = await offline(M().tutorAn, w1s8, "manual_import", "Paper retelling, 6 sentences");
      expect(onPaper.attempt_no).toBe(1);
      expect(await q1("select observed_directly, facets->>'checkpoint' as cp from english.episodes where attempt_id = $1", [onPaper.attempt_id])).toEqual([{ observed_directly: false, cp: "true" }]);
    });

    it("a parent can still record ordinary paper work (not a checkpoint, not a live step)", async () => {
      const act = await activity(aW1, 6); // ACT-WRITE practice
      const r = await offline(M().parent, act, "manual_import", "Paper writing");
      expect(r.attempt_no).toBe(1);
    });

    it("an expired tutor relationship cannot record these steps either", async () => {
      const act = await activity(aW0, 10); // ACT-SPEAK-LIVE
      await db.client.query("update english.relationships set valid_from = now() - interval '10 days' where member_id = $1", [M().tutorAn]);
      await db.client.query("update english.relationships set valid_to = now() - interval '1 day' where member_id = $1", [M().tutorAn]);
      try {
        await fail(offline(M().tutorAn, act, "tutor_live", "x"), "42501");
      } finally {
        await db.client.query("update english.relationships set valid_to = null where member_id = $1", [M().tutorAn]);
      }
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("a record made afterwards keeps the real order of the work", () => {
    it("cannot be dated before the last attempt of the step - including the student's own submission today", async () => {
      const aW2 = await assign("an", "A-W2-WATERCYCLE");
      const write = await activity(aW2, 7); // ACT-WRITE practice, also doable in the app
      await submitAs(s.users.studentAn, write, { text: "Water rises because the sun heats it." });
      await fail(offline(M().tutorAn, write, "manual_import", "Paper rewrite", { date: YESTERDAY }), "23514", /date_before_last_attempt/);
      expect(await count("select count(*)::int as n from english.attempts where activity_instance_id = $1", [write])).toBe(1);
      const sameDay = await offline(M().tutorAn, write, "manual_import", "Paper rewrite", { date: TODAY });
      expect(sameDay.attempt_no).toBe(2);
    });

    it("an earlier date is fine for the first record; the same day is fine again; going back after a later record is refused", async () => {
      const aW2 = await q1<{ id: string }>("select id from english.inquiry_instances where template_id = 'A-W2-WATERCYCLE'");
      const talk = await activity((aW2[0] as { id: string }).id, 6); // ACT-SPEAK-MONO practice, nothing recorded yet
      const first = await offline(M().tutorAn, talk, "tutor_live", "Retold the water cycle", { date: YESTERDAY });
      expect(first.attempt_no).toBe(1);
      expect((await offline(M().tutorAn, talk, "tutor_live", "Retold it again", { date: YESTERDAY })).attempt_no).toBe(2);
      expect((await offline(M().tutorAn, talk, "tutor_live", "Retold it a third time", { date: TODAY })).attempt_no).toBe(3);
      await fail(offline(M().tutorAn, talk, "tutor_live", "Forgot to write this one down", { date: YESTERDAY }), "23514", /date_before_last_attempt/);
      expect(await count("select count(*)::int as n from english.attempts where activity_instance_id = $1", [talk])).toBe(3);
    });

    it("the step must have been open on the date of the record, not only today", async () => {
      const planned = template("A-W3-EARTHQUAKES").steps[6]?.planned_date; // step 7
      expect(planned).toBeTruthy();
      const aW3 = await assign("an", "A-W3-EARTHQUAKES", dueReleasing("A-W3-EARTHQUAKES", 7));
      const step = await activity(aW3, 7); // ACT-WRITE practice that opens today
      expect(await q1("select english.eng_step_effective_date($1)::text as d", [step])).toEqual([{ d: TODAY }]);
      await fail(offline(M().tutorAn, step, "manual_import", "Paper work", { date: YESTERDAY }), "23514", /step_not_open_on_date/);
      expect((await offline(M().tutorAn, step, "manual_import", "Paper work", { date: TODAY })).attempt_no).toBe(1);
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("a student reads only their own work, never what an adult recorded for them", () => {
    it("direct SELECTs as the student return the in-app attempt and its text, but no tutor_live / manual_import row, text or author", async () => {
      const aW2 = (await q1<{ id: string }>("select id from english.inquiry_instances where template_id = 'A-W2-WATERCYCLE'"))[0] as { id: string };
      const write = await activity(aW2.id, 7); // attempt 1 in the app (the student), attempt 2 on paper (the tutor)
      const asStudent = <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
        as(db.client, "authenticated", s.users.studentAn, async (q) => (await q(sql, params)).rows as R[]);

      expect(await q1("select attempt_no, provenance from english.attempts where activity_instance_id = $1 order by attempt_no", [write])).toEqual([
        { attempt_no: 1, provenance: "in_app" }, { attempt_no: 2, provenance: "manual_import" },
      ]);
      const mine = await asStudent<{ attempt_no: number; provenance: string }>("select attempt_no, provenance from english.attempts where activity_instance_id = $1 order by attempt_no", [write]);
      expect(mine).toEqual([{ attempt_no: 1, provenance: "in_app" }]);
      const art = await asStudent<{ content: { text?: string }; created_by: string }>(
        "select v.content, v.created_by from english.artifact_versions v join english.attempts t on t.id = v.attempt_id where t.activity_instance_id = $1", [write]);
      expect(art).toHaveLength(1);
      expect(art[0]?.content.text).toMatch(/Water rises/);

      // across the whole child: nothing recorded by an adult is readable, by any route
      expect(await asStudent("select 1 from english.attempts where provenance in ('tutor_live', 'manual_import')")).toEqual([]);
      expect(await asStudent("select 1 from english.artifact_versions v where v.created_by in ($1, $2)", [M().tutorAn, M().parent])).toEqual([]);
      expect(await asStudent("select 1 from english.artifact_versions v join english.attempts t on t.id = v.attempt_id where t.provenance <> 'in_app' and t.provenance <> 'pasted'")).toEqual([]);
      expect(await asStudent("select 1 from english.artifact_versions where content::text like '%Paper rewrite%'")).toEqual([]);
      expect(await asStudent("select 1 from english.assistance_events")).toEqual([]);
      expect(await asStudent("select 1 from english.episodes")).toEqual([]);

      // the adults still read everything
      for (const uid of [s.users.tutorAn, s.users.parent]) {
        const rows = await as(db.client, "authenticated", uid, async (q) => (await q("select provenance from english.attempts where activity_instance_id = $1", [write])).rows);
        expect(rows).toHaveLength(2);
      }
      // the other child's student reads none of An's
      expect(await as(db.client, "authenticated", s.users.studentNguyen, async (q) => (await q("select 1 from english.attempts")).rows)).toEqual([]);
    });

    it("the student's own screens show an offline record only as a neutral status: kind and time, no text, no author, no help", async () => {
      const aW2 = (await q1<{ id: string }>("select id from english.inquiry_instances where template_id = 'A-W2-WATERCYCLE'"))[0] as { id: string };
      const talk = await activity(aW2.id, 6); // only offline records (tutor_live)
      const view = await rpcAs<{ attempts: Record<string, unknown>[] } | null>(s.users.studentAn, "select english.eng_my_activity($1) as r", [talk]);
      // a speaking step is not an app step: the student gets a label and nothing else
      expect(JSON.stringify(view)).not.toMatch(/Retold|tutor|created_by|assist|recorded/i);
      const home = await rpcAs<{ inquiries: { instance_id: string; steps: { step_no: number; attempts: number }[] }[] }>(s.users.studentAn, "select english.eng_my_home() as r");
      expect(home.inquiries.find((i) => i.instance_id === aW2.id)?.steps.find((st) => st.step_no === 6)?.attempts).toBe(3);

      const write = await activity(aW2.id, 7);
      const w = await rpcAs<{ attempts: Record<string, unknown>[] }>(s.users.studentAn, "select english.eng_my_activity($1) as r", [write]);
      expect(w.attempts.map((a) => Object.keys(a).sort())).toEqual([["attempt_no", "provenance", "submitted_at"], ["attempt_no", "provenance", "submitted_at"]]);
      expect(JSON.stringify(w)).not.toMatch(/Paper rewrite|recorded_by|created_by|declared|assist/i);
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("a criterion only the tutor can hear live is ticked only on work watched live", () => {
    it("B-L4-EXPLAIN-S (c1 heard live, c2 for a rater): without live observation c1 is refused, c2 is accepted and the skill stays scorable", async () => {
      const bW0 = await assign("nguyen", "B-W0-BASELINE");
      const speak = await activity(bW0, 6); // ACT-SPEAK-LIVE baseline
      const { episodeId } = await unwatchedEpisode(speak);
      const view = (await rpcAs<{ targets: { key: string; scorable: boolean; criteria: { id: string; method: string }[] }[] }>(
        s.users.tutorNguyen, "select english.eng_review_episode($1) as r", [episodeId]));
      const t = view.targets.find((x) => x.key === "B-L4-EXPLAIN-S");
      expect(t).toMatchObject({ scorable: true });
      expect(t?.criteria.map((c) => [c.id, c.method])).toEqual([["c1", "tutor_live"], ["c2", "rater"]]);

      await fail(review(M().tutorNguyen, episodeId, "B-L4-EXPLAIN-S", 3, { criteria: { c1: true, c2: true } }), "22023", /live-only/);
      await fail(review(M().tutorNguyen, episodeId, "B-L4-EXPLAIN-S", 2, { criteria: { c1: false } }), "22023", /live-only/);
      expect(await count("select count(*)::int as n from english.observations where episode_id = $1", [episodeId])).toBe(0);
      await review(M().tutorNguyen, episodeId, "B-L4-EXPLAIN-S", 2, { criteria: { c2: true } });
      const [o] = await q1<{ criteria_results: Record<string, boolean> }>("select criteria_results from english.observations where episode_id = $1", [episodeId]);
      expect(o?.criteria_results).toEqual({ c2: true });
    });

    it("on work the tutor watched live both criteria can be ticked", async () => {
      const second = await assign("nguyen", "B-W0-BASELINE"); // a second assignment: its own one-time step 6
      const live = await offline(M().tutorNguyen, await activity(second, 6), "tutor_live", "Nguyên explained why homework should be limited");
      await review(M().tutorNguyen, live.episode_id, "B-L4-EXPLAIN-S", 4, { criteria: { c1: true, c2: true } });
      const [o] = await q1<{ criteria_results: Record<string, boolean> }>("select criteria_results from english.observations where episode_id = $1", [live.episode_id]);
      expect(o?.criteria_results).toEqual({ c1: true, c2: true });
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("the inbox is filtered and paged in SQL, so new work always shows up (more than 500 items)", () => {
    const BULK = 520;
    let practiceStep: string;

    /** Many past submissions of one practice step, made cheaply in SQL (attempts, artifacts and episodes - same rows the app makes). */
    async function bulkSubmissions(activityId: string, n: number): Promise<void> {
      await db.client.query(
        `with first as (select id from english.attempts where activity_instance_id = $1 and attempt_no = 1),
              last as (select coalesce(max(attempt_no), 1) as no from english.attempts where activity_instance_id = $1),
              ins as (
                insert into english.attempts(id, activity_instance_id, learner_id, attempt_no, parent_attempt_id, learning_family_id, mode, provenance,
                                             declared_assistance, submitted_at, content_hash, client_submission_id)
                select gen_random_uuid(), $1, $2, last.no + g, first.id, first.id, 'PRACTICE', 'manual_import', array['none'],
                       now() - interval '3 days' + g * interval '1 second', repeat('a', 64), gen_random_uuid()
                from generate_series(1, $4::int) g, first, last
                returning id),
              art as (
                insert into english.artifact_versions(attempt_id, learner_id, kind, version, content, is_raw, created_by)
                select id, $2, 'text', 1, '{"text":"bulk"}'::jsonb, true, $3 from ins)
         insert into english.episodes(attempt_id, learner_id, is_first_attempt, context_id, observed_directly, facets)
         select id, $2, false, 'A-W1-VOLCANOES', false, '{"baseline":false,"checkpoint":false,"delayed_check":false,"transfer_check":false}'::jsonb from ins`,
        [activityId, s.learners.an, M().tutorAn, n],
      );
    }

    it("520 open items: the default page is the oldest 50, the cursor reaches the very last one, nothing is skipped or repeated", async () => {
      practiceStep = await activity(aW1, 6);
      await bulkSubmissions(practiceStep, BULK);
      const fresh = await offline(M().parent, practiceStep, "manual_import", "A brand new submission"); // the newest of all
      const freshEpisode = fresh.episode_id;

      const first = await inboxPage(s.users.tutorAn);
      expect(first.items).toHaveLength(50);
      expect(first.next).not.toBeNull();
      expect(first.counts.todo).toBeGreaterThan(500);
      expect(first.items.map((r) => r.submitted_at)).toEqual([...first.items.map((r) => r.submitted_at)].sort());

      const all = await walk(s.users.tutorAn, "todo", 50);
      expect(all.rows.length).toBe(all.counts.todo);
      expect(all.pages).toBe(Math.ceil(all.rows.length / 50));
      expect(new Set(all.rows.map((r) => r.episode_id)).size).toBe(all.rows.length);
      expect(all.rows.at(-1)?.episode_id).toBe(freshEpisode); // reached through the cursor, although it is the 500+ th
      const times = all.rows.map((r) => Date.parse(r.submitted_at));
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      // a page larger than the maximum is clamped, never an error
      expect((await inboxPage(s.users.tutorAn, "todo", 5000)).items).toHaveLength(100);
    });

    it("once the old ones are decided they leave the default view: the new submission is on the first page, the old ones are under 'done'", async () => {
      await db.client.query(
        `insert into english.validation_decisions(episode_id, learner_id, target_key, decision, final_score, final_not_observed, validator_member_id, validator_role)
         select e.id, e.learner_id, k, 'AGREE', 3, false, $2, 'tutor'
         from english.episodes e join english.attempts a on a.id = e.attempt_id
              cross join (values ('A-L3-CAUSE-W'), ('A-L2-CHUNKS')) as t(k)
         where a.activity_instance_id = $1 and a.content_hash = repeat('a', 64)`,
        [practiceStep, M().tutorAn],
      );
      const todo = await inboxPage(s.users.tutorAn);
      expect(todo.counts.done).toBe(BULK);
      expect(todo.items.length).toBeLessThan(20);
      expect(todo.next).toBeNull();
      expect(todo.items.some((r) => r.category === "practice" && r.targets_decided === 0)).toBe(true);
      const done = await walk(s.users.tutorAn, "done", 100);
      expect(done.rows).toHaveLength(BULK);
      expect(done.pages).toBe(Math.ceil(BULK / 100));
      expect(done.rows.every((r) => r.targets_decided === r.targets_total)).toBe(true);
      expect(new Set(done.rows.map((r) => r.episode_id)).size).toBe(BULK);
      // the category filters only show open items
      const practice = await walk(s.users.tutorAn, "practice", 50);
      expect(practice.rows.every((r) => r.category === "practice" && r.targets_decided < r.targets_total)).toBe(true);
    });

    it("the counts follow the person: the parent's 'to decide' leaves out what only the tutor may decide; others see zero; bad input is refused", async () => {
      const tutor = await inboxPage(s.users.tutorAn);
      const parent = await inboxPage(s.users.parent);
      expect(parent.counts.todo).toBe(tutor.counts.todo);
      expect(parent.counts.to_decide).toBeLessThan(tutor.counts.to_decide ?? 0); // checkpoint / live work is read-only for the parent
      expect(tutor.counts.to_decide).toBe(tutor.counts.todo);
      const student = await inboxPage(s.users.studentAn);
      expect(student.items).toEqual([]);
      expect(student.counts).toMatchObject({ todo: 0, done: 0, to_decide: 0 });
      // the other child's tutor sees only that child's work
      const other = await inboxPage(s.users.tutorNguyen);
      expect(other.items.every((r) => r.learner_id === s.learners.nguyen)).toBe(true);
      await expect(inboxPage(s.users.tutorAn, "everything")).rejects.toMatchObject({ code: "22023" });
      await expect(rpcAs(s.users.tutorAn, "select english.eng_review_inbox(false, 'todo', 50, now(), null) as r")).rejects.toMatchObject({ code: "22023" });
    });
  });
});

