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

const template = (id: string): InquiryTemplate =>
  JSON.parse(readFileSync(path.join(CONTENT_DIR, "inquiries", `${id}.json`), "utf8")) as InquiryTemplate;
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
  async function assign(who: "an" | "nguyen", templateId: string): Promise<string> {
    const r = await q1<{ id: string }>("select english.eng_assign_inquiry($1, $2, 1, $3, $4, $5) as id", [
      s.learners[who], templateId, dueReleasingAll(templateId), s.members.parent, `s5h-${(seq += 1)}-${templateId}`,
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
      expect(todo.items.length).toBeLessThan(10);
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
      for (const uid of [s.users.studentAn, s.users.tutorNguyen]) {
        const p = await inboxPage(uid);
        expect(p.items).toEqual([]);
        expect(p.counts).toMatchObject({ todo: 0, done: 0, to_decide: 0 });
      }
      await expect(inboxPage(s.users.tutorAn, "everything")).rejects.toMatchObject({ code: "22023" });
      await expect(rpcAs(s.users.tutorAn, "select english.eng_review_inbox(false, 'todo', 50, now(), null) as r")).rejects.toMatchObject({ code: "22023" });
    });
  });
});

