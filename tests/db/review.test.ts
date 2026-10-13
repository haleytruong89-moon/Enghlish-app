import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../../lib/config/content";
import type { InquiryTemplate } from "../../lib/config/schemas";
import { addDays, daysBetween, todayVn } from "../../lib/inquiries/dates";
import { as, asCommit, createAuthUser, createTestDb, errorAs, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

const TODAY = todayVn();
const YESTERDAY = addDays(TODAY, -1);

const template = (id: string): InquiryTemplate =>
  JSON.parse(readFileSync(path.join(CONTENT_DIR, "inquiries", `${id}.json`), "utf8")) as InquiryTemplate;
function dueReleasingAll(id: string): string {
  const t = template(id);
  const last = t.steps.map((s) => s.planned_date ?? "").sort().at(-1) ?? "";
  return addDays(TODAY, daysBetween(last, t.dates.to));
}
function dueReleasing(id: string, stepNo: number): string {
  const t = template(id);
  const planned = t.steps[stepNo - 1]?.planned_date;
  if (!planned) throw new Error("step has no planned date");
  return addDays(TODAY, daysBetween(planned, t.dates.to));
}

type Dec = {
  id: string;
  decision: string;
  final_score: number | null;
  final_not_observed: boolean;
  validator_role: string;
  reason: string | null;
  supersedes_id: string | null;
  current: boolean;
  blind: boolean;
};
type EpisodeView = {
  episode: { id: string; restricted: boolean; observed_directly: boolean; facets: Record<string, boolean> };
  viewer: { role: string; can_decide: boolean };
  attempt: { provenance: string; attempt_no: number; declared_assistance: string[]; recorded_by_name: string | null };
  artifact: { kind: string; content: Record<string, unknown> };
  assistance: { kind: string; verification: string; detail: string | null; note: string | null; affects: string[] }[];
  keys: unknown[];
  targets: { key: string; scorable: boolean; locked_reason: string | null; title_vi: string | null; dimension: { rubric_vi: unknown } | null; criteria: { id: string }[]; decisions: Dec[] }[];
};
type InboxRow = {
  episode_id: string;
  attempt_id: string;
  learner_id: string;
  category: string;
  restricted: boolean;
  can_decide: boolean;
  targets_total: number;
  targets_decided: number;
  provenance: string;
  alias: string;
};

describe("S5 review: scores per skill, D15 routing, work outside the app, lesson notes (DESIGN §6 §7 §8, PRD D15)", () => {
  let db: TestDb;
  let s: Seeded;
  let parent2User: string;
  let parent2Member: string;
  const an = () => s.users.studentAn;
  const nguyen = () => s.users.studentNguyen;
  const M = () => s.members;

  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const count = async (sql: string, params: unknown[] = []) => ((await q1<{ n: number }>(sql, params))[0] as { n: number }).n;

  let reqSeq = 0;
  async function assign(who: "an" | "nguyen", templateId: string, due: string): Promise<string> {
    const r = await q1<{ id: string }>("select english.eng_assign_inquiry($1, $2, 1, $3, $4, $5) as id", [
      s.learners[who], templateId, due, s.members.parent, `s5-test-${(reqSeq += 1)}-${templateId}`,
    ]);
    return (r[0] as { id: string }).id;
  }
  async function activity(instance: string, stepNo: number): Promise<string> {
    return ((await q1<{ id: string }>("select id from english.activity_instances where inquiry_instance_id = $1 and step_no = $2", [instance, stepNo]))[0] as { id: string }).id;
  }
  const episodeOf = async (attemptId: string) =>
    ((await q1<{ id: string }>("select id from english.episodes where attempt_id = $1", [attemptId]))[0] as { id: string }).id;

  type Receipt = { attempt_id: string; attempt_no: number };
  const submitAs = (userId: string, activityId: string, content: unknown, assistance: string[] = ["none"]) =>
    asCommit(db.client, "authenticated", userId, async (q) => {
      const r = await q("select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], 'in_app') as r", [activityId, randomUUID(), JSON.stringify(content), assistance]);
      return (r.rows[0] as { r: Receipt }).r;
    });
  const rpcAs = <T = unknown>(userId: string | null, sql: string, params: unknown[] = []) =>
    as(db.client, "authenticated", userId, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);

  type Review = { observation_id: string; decision_id: string; replayed: boolean };
  const review = (by: string, episode: string, target: string, score: number | null, opts: { notObserved?: boolean; criteria?: unknown; rationale?: string | null; clientId?: string } = {}) =>
    svc<Review>("select english.eng_record_review($1, $2, $3::smallint, $4, $5::jsonb, $6, $7, $8) as r", [
      episode, target, score, opts.notObserved ?? false, opts.criteria === undefined ? null : JSON.stringify(opts.criteria), opts.rationale ?? null, by, opts.clientId ?? randomUUID(),
    ]);
  const modify = (by: string, decision: string, score: number | null, reason: string | null, opts: { notObserved?: boolean; clientId?: string } = {}) =>
    svc<{ decision_id: string; replayed: boolean }>("select english.eng_modify_decision($1, $2::smallint, $3, $4, $5, $6) as r", [decision, score, opts.notObserved ?? false, reason, by, opts.clientId ?? randomUUID()]);
  const support = (by: string, attempt: string, targets: string[], kind: string, note: string | null, clientId: string | null = null) =>
    svc<{ id: string; replayed: boolean }>("select english.eng_record_observed_support($1, $2::text[], $3, $4, $5, $6) as r", [attempt, targets, kind, note, by, clientId]);
  type Offline = { attempt_id: string; episode_id: string; attempt_no: number; submitted_at: string; replayed: boolean };
  const offline = (by: string, activityId: string, provenance: string, text: string, opts: { date?: string; assistance?: string[]; duration?: number | null; words?: number | null; clientId?: string } = {}) =>
    svc<Offline>("select english.eng_record_offline_attempt($1, $2, $3, $4, $5, $6::date, $7::text[], $8, $9) as r", [
      activityId, provenance, text, opts.duration ?? null, opts.words ?? null, opts.date ?? TODAY, opts.assistance ?? ["none"], by, opts.clientId ?? randomUUID(),
    ]);
  type Note = { id: string; replayed: boolean };
  const note = (by: string, learner: string, o: { date?: string; goals?: string | null; observed?: string | null; level?: string; actions?: string[]; practised?: string[]; published?: boolean; supersedes?: string | null; clientId?: string } = {}) =>
    svc<Note>("select english.eng_write_lesson_note($1, $2::date, $3, $4, $5, $6::text[], $7::text[], $8, $9, $10, $11) as r", [
      learner, o.date ?? TODAY, o.goals === undefined ? "Goal of the session" : o.goals, o.observed === undefined ? "What I saw" : o.observed, o.level ?? "light",
      o.actions ?? ["Do one more"], o.practised ?? [], o.published ?? false, o.supersedes ?? null, by, o.clientId ?? randomUUID(),
    ]);
  const viewAs = (userId: string, episode: string) => rpcAs<EpisodeView | null>(userId, "select english.eng_review_episode($1) as r", [episode]);
  type InboxPage = { items: InboxRow[]; next: { at: string; id: string } | null; counts: Record<string, number> };
  const inboxPageAs = (userId: string, allowReal = false, filter = "todo", limit = 100, after: { at: string; id: string } | null = null) =>
    rpcAs<InboxPage>(userId, "select english.eng_review_inbox($1, $2, $3, $4, $5) as r", [allowReal, filter, limit, after?.at ?? null, after?.id ?? null]);
  /** Everything in the inbox (open items and finished ones), oldest first - the two filters walked page by page. */
  const inboxAs = async (userId: string, allowReal = false) => {
    const out: InboxRow[] = [];
    for (const filter of ["todo", "done"]) {
      let after: { at: string; id: string } | null = null;
      do {
        const page: InboxPage = await inboxPageAs(userId, allowReal, filter, 100, after);
        out.push(...page.items);
        after = page.next;
      } while (after);
    }
    const t = new Map((await q1<{ id: string; at: string }>("select e.id, a.submitted_at::text as at from english.episodes e join english.attempts a on a.id = e.attempt_id")).map((r) => [r.id, r.at]));
    return out.sort((x, y) => (t.get(x.episode_id) ?? "").localeCompare(t.get(y.episode_id) ?? "") || x.episode_id.localeCompare(y.episode_id));
  };
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };

  // fixtures ---------------------------------------------------------------------------------------------------
  let r1: string; // An, A-W1, everything released
  let r2: string; // An, A-W1, steps 1-3 released only
  let b0: string; // Nguyên, B-W0 baseline, everything released
  let ep6: string; // An step 6 (writing practice) attempt 1, in app
  let att6: string;
  let ep3: string; // An step 3 (reading, independent check), in app
  let att3: string;
  let ep11: string; // An step 11 (writing checkpoint), in app
  let att11: string;
  let epB5: string; // Nguyên baseline writing
  let attB5: string;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    parent2User = await createAuthUser(db.client, "parent2@test.local");
    const fam = ((await q1<{ id: string }>("insert into english.families(name) values ('Other family') returning id"))[0] as { id: string }).id;
    parent2Member = ((await q1<{ id: string }>("insert into english.members(user_id, family_id, role, display_name) values ($1, $2, 'parent', 'Other parent') returning id", [parent2User, fam]))[0] as { id: string }).id;

    r1 = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
    r2 = await assign("an", "A-W1-VOLCANOES", dueReleasing("A-W1-VOLCANOES", 2));
    b0 = await assign("nguyen", "B-W0-BASELINE", dueReleasingAll("B-W0-BASELINE"));

    att6 = (await submitAs(an(), await activity(r1, 6), { text: "Volcanoes erupt because the magma rises." })).attempt_id;
    ep6 = await episodeOf(att6);
    att3 = (await submitAs(an(), await activity(r1, 3), { answers: { "W1-R7": "Probably not." } })).attempt_id;
    ep3 = await episodeOf(att3);
    att11 = (await submitAs(an(), await activity(r1, 11), { text: "Some volcanoes explode because their magma is thick." })).attempt_id;
    ep11 = await episodeOf(att11);
    attB5 = (await submitAs(nguyen(), await activity(b0, 5), { text: "Although the policy sounds fair, it has hidden costs." })).attempt_id;
    epB5 = await episodeOf(attB5);
  });
  afterAll(async () => {
    await db?.drop();
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("D15 routing is enforced inside the database", () => {
    it("who may decide what: tutor of the child always; parent only when it is not a checkpoint or watched live; nobody else", async () => {
      // routine work: tutor and parent both
      expect(await q1("select english.eng_review_role($1, $2) as r", [ep6, M().tutorAn])).toEqual([{ r: "tutor" }]);
      expect(await q1("select english.eng_review_role($1, $2) as r", [ep6, M().parent])).toEqual([{ r: "parent" }]);
      // checkpoint (in the session): tutor only
      expect(await q1("select english.eng_review_role($1, $2) as r", [ep11, M().tutorAn])).toEqual([{ r: "tutor" }]);
      expect(await q1("select english.eng_review_role($1, $2) as r", [ep11, M().parent])).toEqual([{ r: null }]);
      // never: the student, the other child's tutor, a parent of another family
      for (const who of [M().studentAn, M().tutorNguyen, parent2Member]) {
        expect(await q1("select english.eng_review_role($1, $2) as r", [ep6, who]), who).toEqual([{ r: null }]);
      }
    });

    it("eng_record_review refuses the parent on a checkpoint episode, the student, the other child's tutor and an unknown actor", async () => {
      await fail(review(M().parent, ep11, "A-L3-CAUSE-W", 3), "42501", /D15/);
      await fail(review(M().studentAn, ep6, "A-L3-CAUSE-W", 3), "42501");
      await fail(review(M().tutorNguyen, ep6, "A-L3-CAUSE-W", 3), "42501");
      await fail(review(parent2Member, ep6, "A-L3-CAUSE-W", 3), "42501");
      await fail(review(randomUUID(), ep6, "A-L3-CAUSE-W", 3), "42501");
      await fail(review(M().tutorAn, randomUUID(), "A-L3-CAUSE-W", 3), "P0002");
      expect(await count("select count(*)::int as n from english.observations")).toBe(0);
    });

    it("an expired tutor relationship stops reviewing; restoring it restores the right", async () => {
      await db.client.query("update english.relationships set valid_from = now() - interval '10 days' where member_id = $1", [M().tutorAn]);
      await db.client.query("update english.relationships set valid_to = now() - interval '1 day' where member_id = $1", [M().tutorAn]);
      try {
        await fail(review(M().tutorAn, ep6, "A-L3-CAUSE-W", 3), "42501");
        await fail(offline(M().tutorAn, await activity(r1, 9), "tutor_live", "x"), "42501");
        await fail(note(M().tutorAn, s.learners.an), "42501");
        expect(await viewAs(s.users.tutorAn, ep6)).toBeNull();
        expect(await inboxAs(s.users.tutorAn)).toEqual([]);
      } finally {
        await db.client.query("update english.relationships set valid_to = null where member_id = $1", [M().tutorAn]);
      }
      expect(await viewAs(s.users.tutorAn, ep6)).not.toBeNull();
    });

    it("the write functions cannot be called by signed-in users or anonymous callers at all", async () => {
      const sql = "select english.eng_record_review($1, 'A-L3-CAUSE-W', 3::smallint, false, null, null, $2, 'abcdefgh1')";
      for (const [role, uid] of [["authenticated", s.users.tutorAn], ["anon", null], ["authenticated", s.users.parent]] as const) {
        const e = await errorAs(db.client, role, uid, sql, [ep6, M().tutorAn]);
        expect(e?.code, role).toBe("42501");
      }
      for (const [fn, params] of [
        ["eng_modify_decision($1, 3::smallint, false, 'reason', $2, 'abcdefgh1')", [randomUUID(), M().tutorAn]],
        ["eng_write_lesson_note($1, current_date, 'g', 'o', 'light', '{}'::text[], '{}'::text[], false, null, $2, 'abcdefgh1')", [s.learners.an, M().tutorAn]],
      ] as const) {
        const e = await errorAs(db.client, "authenticated", s.users.tutorAn, `select english.${fn}`, [...params]);
        expect(e?.code, fn).toBe("42501");
      }
      // helpers are not callable either
      const e = await errorAs(db.client, "authenticated", s.users.tutorAn, "select english.eng_review_role($1, $2)", [ep6, M().tutorAn]);
      expect(e?.code).toBe("42501");
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("a score = one observation + one AGREE decision (two layers), 0..4 or NULL", () => {
    it("records a score with criteria and a note; stores both layers; blind only for checkpoints", async () => {
      const r = await review(M().tutorAn, ep6, "A-L3-CAUSE-W", 3, { criteria: { c1: true, c2: false }, rationale: "  Uses because correctly.  " });
      expect(r.replayed).toBe(false);
      const [o] = await q1<Record<string, unknown>>("select * from english.observations where id = $1", [r.observation_id]);
      expect(o).toMatchObject({
        episode_id: ep6, learner_id: s.learners.an, target_key: "A-L3-CAUSE-W", scorer: "tutor", scorer_member_id: M().tutorAn,
        status: "PROPOSED", score: 3, not_observed: false, criteria_results: { c1: true, c2: false }, rationale: "Uses because correctly.", blind: false,
      });
      const [d] = await q1<Record<string, unknown>>("select * from english.validation_decisions where id = $1", [r.decision_id]);
      expect(d).toMatchObject({
        episode_id: ep6, learner_id: s.learners.an, target_key: "A-L3-CAUSE-W", observation_id: r.observation_id, decision: "AGREE",
        final_score: 3, final_not_observed: false, validator_member_id: M().tutorAn, validator_role: "tutor", supersedes_id: null,
      });
      // checkpoint → blind flag recorded for D16
      const c = await review(M().tutorAn, ep11, "A-L3-CAUSE-W", 2);
      expect(await q1("select blind, rubric_version from english.observations where id = $1", [c.observation_id])).toEqual([{ blind: true, rubric_version: "0.2.1-draft" }]);
    });

    it("the parent can score routine work, recorded as scorer 'parent'", async () => {
      const r = await review(M().parent, ep6, "A-L2-CHUNKS", 4);
      expect(await q1("select scorer, validator_role from english.observations o join english.validation_decisions d on d.observation_id = o.id where o.id = $1", [r.observation_id])).toEqual([{ scorer: "parent", validator_role: "parent" }]);
    });

    it("'no opportunity to show it' is stored as NULL with its own flag - never as 0", async () => {
      const r = await review(M().tutorAn, ep3, "A-T1-TEXT-R", null, { notObserved: true });
      expect(await q1("select score, not_observed from english.observations where id = $1", [r.observation_id])).toEqual([{ score: null, not_observed: true }]);
      expect(await q1("select final_score, final_not_observed from english.validation_decisions where id = $1", [r.decision_id])).toEqual([{ final_score: null, final_not_observed: true }]);
      // the skill now has its decision: a second first-decision (even a real 0) is refused - a 0 is exercised in the modify test below
      await fail(review(M().tutorAn, ep3, "A-T1-TEXT-R", 0), "23505");
    });

    it("rejects out-of-range scores, both-or-neither of score and NULL, and bad notes", async () => {
      const t = "A-L3-CAUSE-W";
      await fail(review(M().tutorAn, ep11, t, 5), "22023");
      await fail(review(M().tutorAn, ep11, t, -1), "22023");
      await fail(review(M().tutorAn, ep11, t, null), "22023"); // neither
      await fail(review(M().tutorAn, ep11, t, 2, { notObserved: true }), "22023"); // both
      await fail(review(M().tutorAn, ep11, t, 0, { notObserved: true }), "22023"); // 0 is not NULL
      await fail(review(M().tutorAn, ep11, "A-L2-CHUNKS", 2, { rationale: "x".repeat(2001) }), "22023");
      await fail(review(M().tutorAn, ep11, "A-L2-CHUNKS", 2, { criteria: { nope: true } }), "22023");
      await fail(review(M().tutorAn, ep11, "A-L2-CHUNKS", 2, { criteria: { c1: "yes" } }), "22023");
      await fail(review(M().tutorAn, ep11, "A-L2-CHUNKS", 2, { criteria: [true] }), "22023");
      await fail(review(M().tutorAn, ep11, "A-L2-CHUNKS", 2, { clientId: "short" }), "22023");
      // the database CHECKs agree even if a function were bypassed
      await expect(db.client.query(
        "insert into english.observations(episode_id, learner_id, target_key, scorer, scorer_member_id, status, score, not_observed, blind, rubric_version, client_id) values ($1,$2,'A-L2-CHUNKS','tutor',$3,'PROPOSED',3,true,false,'0.2','abcdefgh9')",
        [ep11, s.learners.an, M().tutorAn])).rejects.toMatchObject({ code: "23514" });
      await expect(db.client.query(
        "insert into english.observations(episode_id, learner_id, target_key, scorer, scorer_member_id, status, score, not_observed, blind, rubric_version, client_id) values ($1,$2,'A-L2-CHUNKS','tutor',$3,'PROPOSED',9,false,false,'0.2','abcdefgh8')",
        [ep11, s.learners.an, M().tutorAn])).rejects.toMatchObject({ code: "23514" });
      expect(await count("select count(*)::int as n from english.observations where episode_id = $1", [ep11])).toBe(1); // only the blind one above
    });

    it("the skill must belong to the step (and be a real skill): others and the aggregate indicator are refused", async () => {
      await fail(review(M().tutorAn, ep6, "A-T7-OPINION", 3), "23514", /cannot be scored/); // a skill of another step
      await fail(review(M().tutorAn, ep6, "B-L1-COMPLEX-W", 3), "23514"); // a skill of the other track
      await fail(review(M().tutorAn, ep6, "nonsense", 3), "23514");
      // Nguyên's baseline step 1 lists AGG-B-EXAM-MOCK, which is an indicator, not a skill
      const paper = await offline(M().parent, await activity(b0, 1), "manual_import", "Paper mock exam, part 1");
      const view = (await viewAs(s.users.tutorNguyen, paper.episode_id)) as EpisodeView;
      expect(view.targets.find((t) => t.key === "AGG-B-EXAM-MOCK")).toMatchObject({ scorable: false, locked_reason: "not_a_skill" });
      await fail(review(M().tutorNguyen, paper.episode_id, "AGG-B-EXAM-MOCK", 3), "23514");
      await review(M().tutorNguyen, paper.episode_id, "B-L2-CLOZE", 2);
    });

    it("one decision per skill: a second first-decision is refused; the same client id replays; a different score under the same id is a conflict", async () => {
      const id = randomUUID();
      const first = await review(M().tutorAn, ep6, "A-L3-CAUSE-W", 3, { clientId: id }).catch((e: { code?: string }) => e.code);
      expect(first).toBe("23505"); // decided in the first test of this block
      const dec = ((await q1<{ id: string; observation_id: string; client_id: string }>("select id, observation_id, client_id from english.validation_decisions where episode_id = $1 and target_key = 'A-L3-CAUSE-W'", [ep6]))[0]) as { id: string; observation_id: string; client_id: string };
      const replay = await review(M().tutorAn, ep6, "A-L3-CAUSE-W", 3, { clientId: dec.client_id });
      expect(replay).toEqual({ observation_id: dec.observation_id, decision_id: dec.id, replayed: true });
      await fail(review(M().tutorAn, ep6, "A-L3-CAUSE-W", 1, { clientId: dec.client_id }), "23505");
      await fail(review(M().parent, ep6, "A-L3-CAUSE-W", 3, { clientId: dec.client_id }), "23505");
      expect(await count("select count(*)::int as n from english.validation_decisions where episode_id = $1 and target_key = 'A-L3-CAUSE-W'", [ep6])).toBe(1);
    });

    it("a live step (A-X1-TURN) is recorded by the tutor as tutor_live only: the parent and a paper record are refused; the work is then scorable by the tutor alone", async () => {
      const act9 = await activity(r1, 9);
      await fail(offline(M().parent, act9, "manual_import", "Paper note about a conversation"), "42501", /D15/);
      await fail(offline(M().parent, act9, "tutor_live", "I watched it"), "42501");
      await fail(offline(M().tutorAn, act9, "manual_import", "Paper note about a conversation"), "22023", /tutor_live/);
      expect(await count("select count(*)::int as n from english.attempts where activity_instance_id = $1", [act9])).toBe(0);
      const live = await offline(M().tutorAn, act9, "tutor_live", "Tutor notes: An took turns and asked one follow-up question");
      const view = (await viewAs(s.users.parent, live.episode_id)) as EpisodeView;
      expect(view.viewer.can_decide).toBe(false);
      expect(view.targets.find((t) => t.key === "A-X1-TURN")).toMatchObject({ scorable: true, locked_reason: null });
      await fail(review(M().parent, live.episode_id, "A-L2-COMPENSATE-S", 3), "42501");
      await review(M().tutorAn, live.episode_id, "A-L2-COMPENSATE-S", 2);
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("changing a decision keeps the history", () => {
    let dec0: string;
    let dec1: string;
    let dec2: string;
    beforeAll(async () => {
      dec0 = ((await q1<{ id: string }>("select id from english.validation_decisions where episode_id = $1 and target_key = 'A-L2-CHUNKS'", [ep6]))[0] as { id: string }).id; // parent gave 4
    });

    it("needs a reason of at least 3 characters and a different value", async () => {
      await fail(modify(M().tutorAn, dec0, 2, null), "23514", /reason/);
      await fail(modify(M().tutorAn, dec0, 2, "  ab "), "23514", /reason/);
      await fail(modify(M().tutorAn, dec0, 4, "same as before"), "23514", /same/);
      await fail(modify(M().tutorAn, dec0, 7, "out of range"), "22023");
      await fail(modify(M().tutorAn, dec0, 2, "x".repeat(1001)), "22023");
      expect(await count("select count(*)::int as n from english.validation_decisions where supersedes_id is not null")).toBe(0);
    });

    it("writes a MODIFY row that supersedes the old one; the old rows are untouched; exactly one is current", async () => {
      const m = await modify(M().tutorAn, dec0, 2, "Too generous - only two chunks used");
      dec1 = m.decision_id;
      expect(m.replayed).toBe(false);
      const rows = await q1<Record<string, unknown>>("select decision, final_score, final_not_observed, validator_role, reason, supersedes_id from english.validation_decisions where id in ($1, $2) order by created_at", [dec0, dec1]);
      expect(rows).toEqual([
        { decision: "AGREE", final_score: 4, final_not_observed: false, validator_role: "parent", reason: null, supersedes_id: null },
        { decision: "MODIFY", final_score: 2, final_not_observed: false, validator_role: "tutor", reason: "Too generous - only two chunks used", supersedes_id: dec0 },
      ]);
      // the original observation (the parent's score) is still there
      expect(await q1("select scorer, score from english.observations o join english.validation_decisions d on d.observation_id = o.id where d.id = $1", [dec0])).toEqual([{ scorer: "parent", score: 4 }]);
      const view = (await viewAs(s.users.tutorAn, ep6)) as EpisodeView;
      const decisions = (view.targets.find((t) => t.key === "A-L2-CHUNKS") as EpisodeView["targets"][number]).decisions;
      expect(decisions.map((d) => [d.id, d.current])).toEqual([[dec0, false], [dec1, true]]);
      expect(decisions.filter((d) => d.current)).toHaveLength(1);
    });

    it("can be changed again (to a real 0, then to NULL); the chain stays linear and the latest is current", async () => {
      dec2 = (await modify(M().tutorAn, dec1, 0, "Re-read: none of the chunks")).decision_id;
      const nul = await modify(M().parent, dec2, null, "Nothing to judge here", { notObserved: true });
      const view = (await viewAs(s.users.parent, ep6)) as EpisodeView;
      const decisions = (view.targets.find((t) => t.key === "A-L2-CHUNKS") as EpisodeView["targets"][number]).decisions;
      expect(decisions.map((d) => [d.final_score, d.final_not_observed, d.current])).toEqual([
        [4, false, false], [2, false, false], [0, false, false], [null, true, true],
      ]);
      expect(decisions.at(-1)?.id).toBe(nul.decision_id);
      // a score of 0 is a score; NULL is not 0
      expect(await q1("select count(*)::int as n from english.validation_decisions where final_score = 0")).toEqual([{ n: 1 }]);
    });

    it("an already replaced decision cannot be replaced again (no forks); the same request replays", async () => {
      await fail(modify(M().tutorAn, dec1, 3, "late edit of an old version"), "23505", /replaced/);
      const cid = randomUUID();
      const latest = ((await q1<{ id: string }>("select id from english.validation_decisions where supersedes_id = $1", [dec2]))[0] as { id: string }).id; // the NULL decision
      const a = await modify(M().tutorAn, latest, 1, "Final answer", { clientId: cid });
      const b = await modify(M().tutorAn, latest, 1, "Final answer", { clientId: cid }); // the same request again (double click)
      expect(b).toMatchObject({ decision_id: a.decision_id, replayed: true });
    });

    it("D15 applies to changes too: the parent cannot change a checkpoint decision; a stranger cannot change anything", async () => {
      const d11 = ((await q1<{ id: string }>("select id from english.validation_decisions where episode_id = $1 and target_key = 'A-L3-CAUSE-W'", [ep11]))[0] as { id: string }).id;
      await fail(modify(M().parent, d11, 4, "I disagree with the tutor"), "42501", /D15/);
      await fail(modify(M().tutorNguyen, d11, 4, "not my child"), "42501");
      await fail(modify(M().studentAn, d11, 4, "I want a better mark"), "42501");
      await fail(modify(M().tutorAn, randomUUID(), 4, "no such decision"), "P0002");
      const m = await modify(M().tutorAn, d11, 3, "Second look: clear cause");
      expect(m.replayed).toBe(false);
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("support is separate from the score", () => {
    it("a reviewer can add observed support for chosen skills of the step; it never changes any score", async () => {
      const before = await q1("select count(*)::int as n from english.observations");
      const r = await support(M().tutorAn, att6, ["A-L3-CAUSE-W"], "frame", "Gave the sentence frame 'because ...'", randomUUID());
      expect(r.replayed).toBe(false);
      expect(await q1("select kind, verification, affects_target_keys, note, recorded_by, detail from english.assistance_events where id = $1", [r.id])).toEqual([
        { kind: "frame", verification: "observed", affects_target_keys: ["A-L3-CAUSE-W"], note: "Gave the sentence frame 'because ...'", recorded_by: M().tutorAn, detail: null },
      ]);
      expect(await q1("select count(*)::int as n from english.observations")).toEqual(before);
      const view = (await viewAs(s.users.parent, ep6)) as EpisodeView;
      expect(view.assistance.some((a) => a.kind === "frame" && a.verification === "observed")).toBe(true);
    });

    it("validates kind, skills of the step, note length; replays by client id; D15 applies", async () => {
      await fail(support(M().tutorAn, att6, ["A-L3-CAUSE-W"], "magic", null), "22023");
      await fail(support(M().tutorAn, att6, ["A-T7-OPINION"], "frame", null), "23514");
      await fail(support(M().tutorAn, att6, [], "frame", null), "23514");
      await fail(support(M().tutorAn, att6, ["A-L3-CAUSE-W"], "frame", "x".repeat(1001)), "22023");
      await fail(support(M().parent, att11, ["A-L3-CAUSE-W"], "frame", null), "42501"); // checkpoint
      await fail(support(M().tutorNguyen, att6, ["A-L3-CAUSE-W"], "frame", null), "42501");
      await fail(support(M().tutorAn, randomUUID(), ["A-L3-CAUSE-W"], "frame", null), "P0002");
      const cid = randomUUID();
      const a = await support(M().parent, att6, ["A-L3-CAUSE-W", "A-L2-CHUNKS"], "notes", "Looked at her notes", cid);
      const b = await support(M().parent, att6, ["A-L2-CHUNKS", "A-L3-CAUSE-W"], "notes", "Looked at her notes", cid);
      expect(b).toEqual({ id: a.id, replayed: true });
      await fail(support(M().parent, att6, ["A-L3-CAUSE-W"], "frame", "different", cid), "23505");
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("work outside the app follows the S4 counting rules", () => {
    it("live in the session: tutor only, observed_directly, a checkpoint facet from the step, exposure, no audio, immutable", async () => {
      const act9 = await activity(r1, 9);
      const attemptsBefore = await count("select count(*)::int as n from english.attempts where activity_instance_id = $1", [act9]);
      expect(attemptsBefore).toBe(1); // the live record in the previous block
      await fail(offline(M().parent, await activity(r1, 8), "tutor_live", "x"), "42501"); // the parent cannot claim "I watched live"
      const act5 = await activity(r1, 5); // SPEAK-MONO practice: not in the app at all
      const r = await offline(M().tutorAn, act5, "tutor_live", "Tutor notes: An explained why volcanoes erupt in 5 sentences.", { duration: 95, words: 60, assistance: ["notes"], date: YESTERDAY });
      expect(r).toMatchObject({ attempt_no: 1, replayed: false });
      const [att] = await q1<Record<string, unknown>>("select * from english.attempts where id = $1", [r.attempt_id]);
      expect(att).toMatchObject({ activity_instance_id: act5, learner_id: s.learners.an, attempt_no: 1, parent_attempt_id: null, learning_family_id: r.attempt_id, mode: "PRACTICE", provenance: "tutor_live", declared_assistance: ["notes"] });
      const [art] = await q1<{ kind: string; content: Record<string, unknown>; created_by: string; is_raw: boolean }>("select kind, content, created_by, is_raw from english.artifact_versions where attempt_id = $1", [r.attempt_id]);
      expect(art).toMatchObject({ kind: "text", is_raw: true, created_by: M().tutorAn, content: { text: "Tutor notes: An explained why volcanoes erupt in 5 sentences.", session_date: YESTERDAY, duration_sec: 95, word_count: 60 } });
      expect(JSON.stringify(art)).not.toMatch(/audio|blob|wav|mp3|webm/i);
      const [ep] = await q1<{ is_first_attempt: boolean; observed_directly: boolean; facets: Record<string, boolean> }>("select is_first_attempt, observed_directly, facets from english.episodes where attempt_id = $1", [r.attempt_id]);
      expect(ep).toEqual({ is_first_attempt: true, observed_directly: true, facets: { baseline: false, checkpoint: false, delayed_check: false, transfer_check: false } });
      expect((await q1<{ target_key: string; source: string }>("select target_key, source from english.exposure_log where attempt_id = $1 order by target_key", [r.attempt_id]))).toEqual([
        { target_key: "A-L2-CHUNKS", source: "practice" }, { target_key: "A-L3-CAUSE-S", source: "practice" },
      ]);
      // the date the work happened is the time of the record (noon, Vietnam time), not "now"
      expect(await q1("select (submitted_at at time zone 'Asia/Ho_Chi_Minh')::date::text as d, extract(hour from submitted_at at time zone 'Asia/Ho_Chi_Minh')::int as h from english.attempts where id = $1", [r.attempt_id])).toEqual([{ d: YESTERDAY, h: 12 }]);
      // watched live ⇒ tutor only (D15), and the live-only skills are scorable
      const epId = r.episode_id;
      await fail(review(M().parent, epId, "A-L3-CAUSE-S", 3), "42501");
      await review(M().tutorAn, epId, "A-L3-CAUSE-S", 3);
      // the artifact is immutable
      await expect(db.client.query("update english.artifact_versions set content = '{}' where attempt_id = $1", [r.attempt_id])).rejects.toThrow(/append-only/i);
    });

    it("a live checkpoint step records A-X1-TURN as scorable; the one-time check cannot be recorded twice", async () => {
      const act9 = await activity(r1, 9);
      // the live record above already used this one-time step
      await fail(offline(M().tutorAn, act9, "tutor_live", "second go"), "23505", /one-time/);
      const act8 = await activity(r1, 8);
      const r = await offline(M().tutorAn, act8, "tutor_live", "Retold the volcano process aloud", { duration: 120 });
      expect(r.attempt_no).toBe(1);
      await fail(offline(M().tutorAn, act8, "tutor_live", "again"), "23505", /one-time/);
      await fail(offline(M().tutorAn, act8, "manual_import", "again"), "23505", /one-time/);
      await fail(offline(M().parent, act8, "manual_import", "again"), "42501", /D15/); // a checkpoint step: the tutor alone records it
      const view = (await viewAs(s.users.tutorAn, r.episode_id)) as EpisodeView;
      expect(view.episode).toMatchObject({ restricted: true, observed_directly: true });
      expect(view.episode.facets.checkpoint).toBe(true);
      expect(view.attempt.provenance).toBe("tutor_live");
      expect(view.targets.every((t) => t.scorable)).toBe(true);
      // the student's own screen now sees the step as done (same rule as an in-app submission), and cannot submit it again
      await fail(submitAs(an(), act8, { text: "x" }), "22023"); // still not an app step
      const home = await rpcAs<{ inquiries: { instance_id: string; steps: { step_no: number; attempts: number }[] }[] }>(an(), "select english.eng_my_home() as r");
      expect(home.inquiries.find((i) => i.instance_id === r1)?.steps.find((st) => st.step_no === 8)?.attempts).toBe(1);
    });

    it("paper work (manual_import) by the parent: a later attempt on a practice step is attempt 2 in the same learning family, source 'retry'", async () => {
      const act6 = await activity(r1, 6);
      const r = await offline(M().parent, act6, "manual_import", "Rewritten on paper: Volcanoes erupt because magma is pushed up.", { assistance: ["dictionary"], words: 11 });
      expect(r.attempt_no).toBe(2);
      const [att] = await q1<Record<string, unknown>>("select attempt_no, parent_attempt_id, learning_family_id, provenance, mode from english.attempts where id = $1", [r.attempt_id]);
      expect(att).toEqual({ attempt_no: 2, parent_attempt_id: att6, learning_family_id: att6, provenance: "manual_import", mode: "PRACTICE" });
      expect(await q1("select is_first_attempt, observed_directly from english.episodes where attempt_id = $1", [r.attempt_id])).toEqual([{ is_first_attempt: false, observed_directly: false }]);
      expect((await q1<{ source: string }>("select distinct source from english.exposure_log where attempt_id = $1", [r.attempt_id]))).toEqual([{ source: "retry" }]);
      // declared by someone else, not seen by the tutor
      expect(await q1("select verification, detail, recorded_by from english.assistance_events where attempt_id = $1", [r.attempt_id])).toEqual([{ verification: "declared", detail: "dictionary", recorded_by: M().parent }]);
      // the parent may decide this one (not a checkpoint, not watched live)
      const view = (await viewAs(s.users.parent, r.episode_id)) as EpisodeView;
      expect(view.viewer.can_decide).toBe(true);
      expect(view.attempt.recorded_by_name).toBe("Phụ huynh (thử)");
      await review(M().parent, r.episode_id, "A-L3-CAUSE-W", 3);
    });

    it("tutor_live help is recorded as observed; 'unknown' stands alone and is kept as unknown", async () => {
      const act4 = await activity(r1, 4); // canvas practice
      const live = await offline(M().tutorAn, act4, "tutor_live", "Drew the cause chain together", { assistance: ["asked_someone", "dictionary"] });
      expect(await q1("select detail, verification from english.assistance_events where attempt_id = $1 order by detail", [live.attempt_id])).toEqual([
        { detail: "asked_someone", verification: "observed" }, { detail: "dictionary", verification: "observed" },
      ]);
      const second = await offline(M().parent, act4, "manual_import", "Redrawn at home", { assistance: ["unknown"] });
      expect(second.attempt_no).toBe(2);
      expect(await q1("select kind, detail, verification from english.assistance_events where attempt_id = $1", [second.attempt_id])).toEqual([{ kind: "external_declared", detail: null, verification: "unknown" }]);
      await fail(offline(M().parent, act4, "manual_import", "x", { assistance: ["unknown", "notes"] }), "22023");
      await fail(offline(M().parent, act4, "manual_import", "x", { assistance: ["none", "notes"] }), "22023");
      await fail(offline(M().parent, act4, "manual_import", "x", { assistance: [] }), "22023");
      await fail(offline(M().parent, act4, "manual_import", "x", { assistance: ["telepathy"] }), "22023");
    });

    it("validates the text, numbers, date and step; refuses a step that is not open", async () => {
      const act7 = await activity(r1, 7);
      await fail(offline(M().tutorAn, act7, "tutor_live", "   "), "22023");
      await fail(offline(M().tutorAn, act7, "tutor_live", "x".repeat(20001)), "22023");
      await fail(offline(M().tutorAn, act7, "tutor_live", "ok", { duration: 7201 }), "22023");
      await fail(offline(M().tutorAn, act7, "tutor_live", "ok", { words: -1 }), "22023");
      await fail(offline(M().tutorAn, act7, "audio", "ok"), "22023");
      await fail(offline(M().tutorAn, act7, "in_app", "ok"), "22023");
      await fail(offline(M().tutorAn, act7, "tutor_live", "ok", { date: addDays(TODAY, 1) }), "23514"); // future
      await fail(offline(M().tutorAn, act7, "tutor_live", "ok", { date: addDays(TODAY, -90) }), "23514"); // before the inquiry existed
      await fail(offline(M().tutorAn, randomUUID(), "tutor_live", "ok"), "P0002");
      await fail(offline(M().tutorAn, await activity(r2, 8), "tutor_live", "ok"), "23514", /not open/); // r2: only steps 1-3 are open
      expect(await count("select count(*)::int as n from english.attempts where activity_instance_id = $1", [await activity(r2, 8)])).toBe(0);
    });

    it("is idempotent on the client id; the same id with anything different is a conflict", async () => {
      const act7 = await activity(r1, 7);
      const id = randomUUID();
      const a = await offline(M().tutorAn, act7, "tutor_live", "Self review talk", { clientId: id, duration: 60 });
      const b = await offline(M().tutorAn, act7, "tutor_live", "Self review talk", { clientId: id, duration: 60 });
      expect(b).toEqual({ ...a, replayed: true });
      await fail(offline(M().tutorAn, act7, "tutor_live", "Different text", { clientId: id, duration: 60 }), "23505");
      await fail(offline(M().tutorAn, act7, "tutor_live", "Self review talk", { clientId: id, duration: 61 }), "23505");
      await fail(offline(M().tutorAn, await activity(r1, 4), "tutor_live", "Self review talk", { clientId: id, duration: 60 }), "23505");
      expect(await count("select count(*)::int as n from english.attempts where client_submission_id = $1", [id])).toBe(1);
      expect(await count("select count(*)::int as n from english.episodes where attempt_id = $1", [a.attempt_id])).toBe(1);
    });

    it("a student who submits a one-time check after a paper record is refused like a second submission (shared counting)", async () => {
      const act2 = await activity(r1, 2); // listening check, in the app, independent
      const paper = await offline(M().tutorAn, act2, "manual_import", "Paper listening quiz: 4 of 6 right");
      expect(paper.attempt_no).toBe(1);
      await fail(submitAs(an(), act2, { answers: { "W1-L2": "Three." } }), "23505", /one-time/);
      const w = await rpcAs<{ can_submit: boolean; attempts: { attempt_no: number; provenance: string }[] }>(an(), "select english.eng_my_activity($1) as r", [act2]);
      expect(w.can_submit).toBe(false);
      expect(w.attempts.map((a) => a.attempt_no)).toEqual([1]);
    });

    it("work for the other child's activity is refused for this child's tutor and for outsiders", async () => {
      const nact = await activity(b0, 6);
      await fail(offline(M().tutorAn, nact, "tutor_live", "not mine"), "42501");
      await fail(offline(parent2Member, nact, "manual_import", "not mine"), "42501");
      await fail(offline(M().studentAn, nact, "manual_import", "not mine"), "42501");
      await fail(offline(M().studentNguyen, nact, "manual_import", "my own"), "42501");
      const ok = await offline(M().tutorNguyen, nact, "tutor_live", "Explained how a bill becomes a law", { duration: 150 });
      expect(ok.attempt_no).toBe(1);
    });

    it("the in-app path still behaves exactly as in S4 after the refactor (attempt 1 → 2 → 3, exposure source, family, checkpoint facet)", async () => {
      const act6 = await activity(r1, 6);
      const a3 = await submitAs(an(), act6, { text: "Third version." });
      expect(a3.attempt_no).toBe(3);
      const [att] = await q1<{ parent_attempt_id: string; learning_family_id: string }>("select parent_attempt_id, learning_family_id from english.attempts where id = $1", [a3.attempt_id]);
      expect(att?.learning_family_id).toBe(att6);
      expect(att?.parent_attempt_id).not.toBe(att6); // chained to attempt 2
      expect(await q1("select distinct source from english.exposure_log where attempt_id = $1", [a3.attempt_id])).toEqual([{ source: "retry" }]);
      expect(await q1("select facets->>'checkpoint' as c, is_first_attempt from english.episodes where attempt_id = $1", [att11])).toEqual([{ c: "true", is_first_attempt: true }]);
      await fail(submitAs(an(), await activity(r1, 3), { answers: { "W1-R7": "again" } }), "23505", /one-time/);
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("the inbox", () => {
    it("lists only the staff member's children; tells who may decide, what category, and how many skills are decided", async () => {
      const tutor = await inboxAs(s.users.tutorAn);
      expect(tutor.length).toBeGreaterThan(5);
      expect(new Set(tutor.map((r) => r.learner_id))).toEqual(new Set([s.learners.an]));
      expect(tutor.every((r) => r.can_decide)).toBe(true);
      const row6 = tutor.find((r) => r.episode_id === ep6) as InboxRow;
      expect(row6).toMatchObject({ category: "practice", restricted: false, targets_total: 2, targets_decided: 2, provenance: "in_app" });
      expect(tutor.find((r) => r.episode_id === ep11)).toMatchObject({ category: "tutor", restricted: true, targets_total: 4 });
      expect(tutor.find((r) => r.episode_id === ep3)).toMatchObject({ category: "independent", targets_total: 1, targets_decided: 1 });
      expect(tutor.some((r) => r.provenance === "tutor_live")).toBe(true);
      // oldest first
      const times = (await q1<{ id: string }>("select e.id from english.episodes e join english.attempts a on a.id = e.attempt_id where e.learner_id = $1 order by a.submitted_at, e.id", [s.learners.an])).map((r) => r.id);
      expect(tutor.map((r) => r.episode_id)).toEqual(times.filter((id) => tutor.some((r) => r.episode_id === id)));
      // steps without any skill (e.g. the live opening talk) are not in the inbox
      expect(await count("select count(*)::int as n from english.episodes")).toBeGreaterThanOrEqual(tutor.length);

      const dad = await inboxAs(s.users.parent);
      expect(dad.map((r) => r.episode_id)).toEqual(expect.arrayContaining(tutor.map((r) => r.episode_id)));
      expect(dad.filter((r) => r.learner_id === s.learners.nguyen).length).toBeGreaterThan(0);
      expect(dad.find((r) => r.episode_id === ep11)).toMatchObject({ can_decide: false, restricted: true }); // visible, read-only
      expect(dad.find((r) => r.episode_id === ep6)).toMatchObject({ can_decide: true });
      expect(new Set(dad.map((r) => r.learner_id))).toEqual(new Set([s.learners.an, s.learners.nguyen]));

      const nTutor = await inboxAs(s.users.tutorNguyen);
      expect(new Set(nTutor.map((r) => r.learner_id))).toEqual(new Set([s.learners.nguyen]));
      expect(nTutor.some((r) => r.episode_id === epB5)).toBe(true);
      expect(nTutor.find((r) => r.episode_id === epB5)).toMatchObject({ category: "baseline", targets_total: 2, targets_decided: 0 });
    });

    it("students, strangers and anonymous callers get nothing", async () => {
      expect(await inboxAs(an())).toEqual([]);
      expect(await inboxAs(nguyen())).toEqual([]);
      expect(await inboxAs(parent2User)).toEqual([]);
      expect(await viewAs(an(), ep6)).toBeNull();
      expect(await viewAs(parent2User, ep6)).toBeNull();
      expect(await viewAs(s.users.tutorNguyen, ep6)).toBeNull();
      expect(await viewAs(s.users.tutorAn, epB5)).toBeNull();
      const anon = await errorAs(db.client, "anon", null, "select english.eng_review_inbox(false)");
      expect(anon?.code).toBe("42501");
    });

    it("real children are hidden unless the app allows them (ALLOW_REAL_LEARNERS)", async () => {
      await db.client.query("update english.learners set is_test = false where id = $1", [s.learners.nguyen]);
      try {
        expect((await inboxAs(s.users.parent, false)).some((r) => r.learner_id === s.learners.nguyen)).toBe(false);
        expect((await inboxAs(s.users.parent, true)).some((r) => r.learner_id === s.learners.nguyen)).toBe(true);
      } finally {
        await db.client.query("update english.learners set is_test = true where id = $1", [s.learners.nguyen]);
      }
    });

    it("the review view carries the work, the rubric and the sealed keys for staff only", async () => {
      const v = (await viewAs(s.users.tutorAn, ep3)) as EpisodeView;
      expect(v.artifact).toMatchObject({ kind: "answers", content: { answers: { "W1-R7": "Probably not." } } });
      expect(v.keys.length).toBeGreaterThan(0);
      const t = v.targets[0] as EpisodeView["targets"][number];
      expect(t.dimension?.rubric_vi).toBeTruthy();
      expect(t.criteria.length).toBeGreaterThan(0);
      expect(t.title_vi).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("lesson notes", () => {
    let n1: string;
    let n2: string;

    it("a tutor writes one: up to 3 next actions, practised skills become exposure rows with source 'lesson'", async () => {
      const r = await note(M().tutorAn, s.learners.an, {
        goals: "Cause and effect", observed: "Needed prompts for 'because'", level: "moderate",
        actions: ["Retell the water cycle", "Write 3 because-sentences", "Bring one question"],
        practised: ["A-L3-CAUSE-S", "A-L2-CHUNKS", "A-L3-CAUSE-S"], published: false,
      });
      n1 = r.id;
      const [row] = await q1<Record<string, unknown>>("select * from english.lesson_notes where id = $1", [n1]);
      expect(row).toMatchObject({
        learner_id: s.learners.an, tutor_member_id: M().tutorAn, goals: "Cause and effect", observed: "Needed prompts for 'because'",
        support_level: "moderate", next_actions: ["Retell the water cycle", "Write 3 because-sentences", "Bring one question"],
        practised_target_ids: ["A-L3-CAUSE-S", "A-L2-CHUNKS"], published: false, supersedes_id: null,
      });
      expect(await q1("select target_key, source, attempt_id from english.exposure_log where lesson_note_id = $1 order by target_key", [n1])).toEqual([
        { target_key: "A-L2-CHUNKS", source: "lesson", attempt_id: null }, { target_key: "A-L3-CAUSE-S", source: "lesson", attempt_id: null },
      ]);
    });

    it("refuses a fourth action, an over-long action, an empty note, bad levels, bad dates and skills of the other track", async () => {
      await fail(note(M().tutorAn, s.learners.an, { actions: ["a", "b", "c", "d"] }), "23514");
      await fail(note(M().tutorAn, s.learners.an, { actions: ["x".repeat(201)] }), "23514");
      await fail(note(M().tutorAn, s.learners.an, { goals: null, observed: null, actions: [] }), "23514");
      await fail(note(M().tutorAn, s.learners.an, { level: "enormous" }), "22023");
      await fail(note(M().tutorAn, s.learners.an, { goals: "x".repeat(1001) }), "22023");
      await fail(note(M().tutorAn, s.learners.an, { date: addDays(TODAY, 1) }), "23514");
      await fail(note(M().tutorAn, s.learners.an, { date: addDays(TODAY, -121) }), "23514");
      await fail(note(M().tutorAn, s.learners.an, { practised: ["B-L1-COMPLEX-W"] }), "23514", /track/);
      await fail(note(M().tutorAn, s.learners.an, { practised: ["nonsense"] }), "23514");
      await fail(note(M().tutorAn, s.learners.an, { clientId: "short" }), "22023");
      expect(await count("select count(*)::int as n from english.lesson_notes")).toBe(1);
    });

    it("only a tutor of THIS child writes notes: not the parent, not the other child's tutor, not students", async () => {
      await fail(note(M().parent, s.learners.an), "42501");
      await fail(note(M().tutorNguyen, s.learners.an), "42501");
      await fail(note(M().studentAn, s.learners.an), "42501");
      await fail(note(parent2Member, s.learners.an), "42501");
      await fail(note(M().tutorAn, randomUUID()), "P0002");
    });

    it("editing writes a new version (the old one stays); only the author, only the newest, and logged skills cannot be un-logged", async () => {
      const cid = randomUUID();
      const r = await note(M().tutorAn, s.learners.an, {
        supersedes: n1, goals: "Cause and effect (edited)", observed: "Better by the end", level: "light",
        actions: ["Retell the water cycle"], practised: ["A-L3-CAUSE-S", "A-L2-CHUNKS", "A-L3-CAUSE-W"], published: true, clientId: cid,
      });
      n2 = r.id;
      expect(await q1("select supersedes_id, published from english.lesson_notes where id = $1", [n2])).toEqual([{ supersedes_id: n1, published: true }]);
      expect(await count("select count(*)::int as n from english.lesson_notes where id = $1 and goals = 'Cause and effect'", [n1])).toBe(1); // untouched
      // only the NEW skill gets a new exposure row
      expect(await q1("select target_key from english.exposure_log where lesson_note_id = $1", [n2])).toEqual([{ target_key: "A-L3-CAUSE-W" }]);
      expect(await note(M().tutorAn, s.learners.an, { supersedes: n1, goals: "Cause and effect (edited)", observed: "Better by the end", level: "light", actions: ["Retell the water cycle"], practised: ["A-L3-CAUSE-S", "A-L2-CHUNKS", "A-L3-CAUSE-W"], published: true, clientId: cid })).toEqual({ id: n2, replayed: true });
      await fail(note(M().tutorAn, s.learners.an, { supersedes: n1, goals: "third version of the old one", practised: ["A-L3-CAUSE-S", "A-L2-CHUNKS"] }), "23505", /replaced/);
      await fail(note(M().tutorAn, s.learners.an, { supersedes: n2, practised: ["A-L3-CAUSE-S"] }), "23514", /logged/);
      await fail(note(M().tutorAn, s.learners.an, { supersedes: randomUUID() }), "P0002");
    });

    it("another tutor of the same child may not edit someone else's note", async () => {
      const second = await createAuthUser(db.client, "tutor2@test.local");
      const m2 = ((await q1<{ id: string }>("insert into english.members(user_id, family_id, role, display_name) values ($1, $2, 'tutor', 'Second tutor') returning id", [second, s.familyId]))[0] as { id: string }).id;
      await db.client.query("insert into english.relationships(member_id, learner_id, relation) values ($1, $2, 'tutor')", [m2, s.learners.an]);
      await fail(note(m2, s.learners.an, { supersedes: n2, practised: ["A-L3-CAUSE-S", "A-L2-CHUNKS", "A-L3-CAUSE-W"] }), "42501", /author/);
      const own = await note(m2, s.learners.an, { goals: "Second tutor's own note", published: false });
      expect(await rowsAs(db.client, "authenticated", s.users.tutorAn, "select id from english.lesson_notes where id = $1", [own.id])).toHaveLength(1); // visible to the other tutor of the child
    });

    it("who can read notes: tutors of the child see every version; the parent only published, current ones; nobody else", async () => {
      const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
      const tutorRows = await rowsAs<{ id: string }>(db.client, "authenticated", s.users.tutorAn, "select id from english.lesson_notes order by created_at");
      expect(ids(tutorRows)).toEqual(expect.arrayContaining([n1, n2]));
      const parentRows = await rowsAs<{ id: string }>(db.client, "authenticated", s.users.parent, "select id from english.lesson_notes");
      expect(ids(parentRows)).toEqual([n2]); // n1 was replaced (and was never published); the second tutor's note is unpublished
      for (const [name, uid] of [["student An", an()], ["student Nguyên", nguyen()], ["tutor of Nguyên", s.users.tutorNguyen], ["other family", parent2User]] as const) {
        expect(await rowsAs(db.client, "authenticated", uid, "select id from english.lesson_notes"), name).toEqual([]);
      }
      expect(await rowsAs(db.client, "anon", null, "select id from english.lesson_notes").catch(() => "denied")).toBe("denied");
      // unpublishing = a newer version that is not published: the parent loses it
      await note(M().tutorAn, s.learners.an, { supersedes: n2, goals: "Withdrawn", published: false, practised: ["A-L3-CAUSE-S", "A-L2-CHUNKS", "A-L3-CAUSE-W"] });
      expect(await rowsAs(db.client, "authenticated", s.users.parent, "select id from english.lesson_notes")).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("RLS: scores and decisions are for staff in scope only", () => {
    it("students read nothing new; the other child's tutor and other families read nothing", async () => {
      for (const t of ["observations", "validation_decisions", "lesson_notes"]) {
        for (const [name, uid] of [["student An", an()], ["student Nguyên", nguyen()], ["tutor of Nguyên (An's data)", s.users.tutorNguyen], ["other family", parent2User]] as const) {
          const rows = await rowsAs<{ learner_id: string }>(db.client, "authenticated", uid, `select learner_id from english.${t}`);
          if (name === "tutor of Nguyên (An's data)") expect(rows.every((r) => r.learner_id !== s.learners.an), `${t} ${name}`).toBe(true);
          else expect(rows, `${t} ${name}`).toEqual([]);
        }
      }
      expect((await rowsAs(db.client, "authenticated", s.users.tutorAn, "select 1 from english.observations")).length).toBeGreaterThan(3);
      expect((await rowsAs(db.client, "authenticated", s.users.parent, "select 1 from english.validation_decisions")).length).toBeGreaterThan(3);
      const e = await errorAs(db.client, "anon", null, "select 1 from english.observations");
      expect(e?.code).toBe("42501");
    });

    it("nobody can write the new tables directly, including the service role", async () => {
      const ins = "insert into english.observations(episode_id, learner_id, target_key, scorer, scorer_member_id, status, score, not_observed, blind, rubric_version, client_id) values ($1,$2,'A-L2-CHUNKS','tutor',$3,'PROPOSED',3,false,false,'0.2','directins1')";
      for (const [role, uid] of [["authenticated", s.users.tutorAn], ["service_role", null], ["anon", null]] as const) {
        const e = await errorAs(db.client, role, uid, ins, [ep6, s.learners.an, M().tutorAn]);
        expect(e?.code, role).toBe("42501");
      }
      for (const t of ["observations", "validation_decisions", "lesson_notes"]) {
        const e = await errorAs(db.client, "service_role", null, `delete from english.${t}`);
        expect(e?.code, t).toBe("42501");
      }
    });

    it("the three tables are append-only even for the owner (update, delete, truncate)", async () => {
      for (const t of ["observations", "validation_decisions", "lesson_notes"]) {
        await expect(db.client.query(`update english.${t} set learner_id = learner_id`)).rejects.toThrow(/append-only/i);
        await expect(db.client.query(`delete from english.${t}`)).rejects.toThrow(/append-only/i);
        await expect(db.client.query(`truncate english.${t}`)).rejects.toThrow(); // refused (foreign key or append-only trigger)
        await expect(db.client.query("select set_config('app.purge_learner', $1, true)", [s.learners.an]).then(() => db.client.query(`delete from english.${t}`))).rejects.toThrow(/append-only/i);
      }
    });

    it("a decision chain cannot fork or skip: unique successor, linear chain, same episode and skill", async () => {
      const [d] = await q1<{ id: string; episode_id: string; target_key: string; observation_id: string }>("select id, episode_id, target_key, observation_id from english.validation_decisions where supersedes_id is null limit 1");
      const row = d as { id: string; episode_id: string; target_key: string; observation_id: string };
      // a second 'first decision' for the same skill
      await expect(db.client.query(
        "insert into english.validation_decisions(episode_id, learner_id, target_key, observation_id, decision, final_score, final_not_observed, validator_member_id, validator_role, client_id) select episode_id, learner_id, target_key, observation_id, 'AGREE', final_score, final_not_observed, validator_member_id, validator_role, 'forkfirst1' from english.validation_decisions where id = $1",
        [row.id])).rejects.toMatchObject({ code: "23505" });
      // a MODIFY without a reason
      await expect(db.client.query(
        "insert into english.validation_decisions(episode_id, learner_id, target_key, decision, final_score, final_not_observed, validator_member_id, validator_role, supersedes_id, client_id) select episode_id, learner_id, target_key, 'MODIFY', 1, false, validator_member_id, validator_role, id, 'noreason01' from english.validation_decisions where id = $1",
        [row.id])).rejects.toMatchObject({ code: "23514" });
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("purge (FR-21)", () => {
    it("removes one child's scores, decisions and notes - and only theirs; the receipt counts them", async () => {
      // Nguyên: two scores here (+ one earlier), one note with exposure, one offline attempt
      await review(M().tutorNguyen, epB5, "B-L1-COMPLEX-W", 3, { rationale: "Concession used" });
      await review(M().tutorNguyen, epB5, "B-L2-PRECISE", null, { notObserved: true });
      await note(M().tutorNguyen, s.learners.nguyen, { goals: "Concession", practised: ["B-L1-COMPLEX-W"], published: true });
      const anBefore = {
        obs: await count("select count(*)::int as n from english.observations where learner_id = $1", [s.learners.an]),
        dec: await count("select count(*)::int as n from english.validation_decisions where learner_id = $1", [s.learners.an]),
        notes: await count("select count(*)::int as n from english.lesson_notes where learner_id = $1", [s.learners.an]),
        expo: await count("select count(*)::int as n from english.exposure_log where learner_id = $1", [s.learners.an]),
      };
      expect(anBefore.obs).toBeGreaterThan(3);
      const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1, $2) as r", [s.learners.nguyen, s.users.parent]);
      expect(receipt.deleted).toMatchObject({ observations: 3, validation_decisions: 3, lesson_notes: 1 });
      for (const t of ["observations", "validation_decisions", "lesson_notes", "exposure_log", "episodes", "attempts", "assistance_events", "artifact_versions"]) {
        expect(await count(`select count(*)::int as n from english.${t} where learner_id = $1`, [s.learners.nguyen]), t).toBe(0);
      }
      expect({
        obs: await count("select count(*)::int as n from english.observations where learner_id = $1", [s.learners.an]),
        dec: await count("select count(*)::int as n from english.validation_decisions where learner_id = $1", [s.learners.an]),
        notes: await count("select count(*)::int as n from english.lesson_notes where learner_id = $1", [s.learners.an]),
        expo: await count("select count(*)::int as n from english.exposure_log where learner_id = $1", [s.learners.an]),
      }).toEqual(anBefore);
      // the older S2/S4 parts of the receipt are still there
      expect(Object.keys(receipt.deleted)).toEqual(expect.arrayContaining(["attempts", "episodes", "exposure_log", "assistance_events", "artifact_versions", "attempt_auto_checks", "working_drafts", "instance_item_keys", "audit_log", "learners", "members"]));
    });

    it("purging An removes everything of An, including the chain of decisions and the notes' exposure rows", async () => {
      const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1, $2) as r", [s.learners.an, s.users.parent]);
      expect(receipt.deleted.validation_decisions).toBeGreaterThan(8);
      expect(receipt.deleted.observations).toBeGreaterThan(4);
      expect(receipt.deleted.lesson_notes).toBeGreaterThanOrEqual(4);
      for (const t of ["observations", "validation_decisions", "lesson_notes", "exposure_log", "episodes", "attempts", "assistance_events", "artifact_versions"]) {
        expect(await count(`select count(*)::int as n from english.${t}`), t).toBe(0);
      }
    });
  });
});
