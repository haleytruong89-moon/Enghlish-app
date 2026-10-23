import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../../lib/config/content";
import type { InquiryTemplate } from "../../lib/config/schemas";
import { addDays, daysBetween, todayVn } from "../../lib/inquiries/dates";
import { seedThrowawayLearner } from "../../scripts/lib/seed";
import { insertValidatedEpisode, type EvidenceSpec } from "../../scripts/lib/skillEvidence";
import { SCORE_WORD_SAMPLES } from "../unit/fixtures/scoreWords";
import { asCommit, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

const TODAY = todayVn();
const template = (id: string): InquiryTemplate =>
  JSON.parse(readFileSync(path.join(CONTENT_DIR, "inquiries", `${id}.json`), "utf8")) as InquiryTemplate;
/** The due date that releases every step of the template today. */
function dueReleasingAll(id: string): string {
  const t = template(id);
  const last = t.steps.map((s) => s.planned_date ?? "").sort().at(-1) ?? "";
  return addDays(TODAY, daysBetween(last, t.dates.to));
}
const SKILL = "A-L3-CAUSE-W"; // An's writing skill on the checkpoint writing steps A-W1 11, A-W2 12, A-W3 13

/** S7a (migrations 0022 + 0023): policy map, decision book, derived state, engine in/out, decisions, reads, purge. One database for the file. */
describe("S7a skill states (migrations 0022 + 0023)", () => {
  let db: TestDb;
  let s: Seeded;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };
  let reqSeq = 0;
  const assign = async (who: "an" | "nguyen", tpl: string) =>
    (await q1<{ id: string }>("select english.eng_assign_inquiry($1, $2, 1, $3, $4, $5) as id", [s.learners[who], tpl, dueReleasingAll(tpl), s.members.parent, `s7a-${(reqSeq += 1)}-${tpl}`]))[0]!.id;
  const step = async (instance: string, stepNo: number) =>
    (await q1<{ id: string }>("select id from english.activity_instances where inquiry_instance_id = $1 and step_no = $2", [instance, stepNo]))[0]!.id;
  const evidence = (who: "an" | "nguyen", spec: EvidenceSpec) =>
    insertValidatedEpisode(db.client, s.learners[who], who === "an" ? s.members.tutorAn : s.members.tutorNguyen, spec);
  /** A row written straight into the book as the table owner (tests only: the app writes through the functions). */
  const book = async (learnerId: string, o: { kind?: string; from?: string; to?: string; key?: string; target?: string } = {}) =>
    (await q1<{ id: string }>(
      `insert into english.mastery_decisions(learner_id, target_key, kind, from_state, to_state, evidence_key, policy_version, engine_version)
       values ($1, $2, $3, $4, $5, $6, 'AP-0.3', 'S7a-1') returning id`,
      [learnerId, o.target ?? SKILL, o.kind ?? "AUTO", o.from ?? "NOT_OBSERVED", o.to ?? "SUPPORTED", o.key ?? `1-${"a".repeat(16)}`],
    ))[0]!.id;

  let w1: string; // An, A-W1 (step 11: checkpoint writing)
  let w2: string; // An, A-W2 (step 12: checkpoint writing)
  let w3: string; // An, A-W3 (step 13: checkpoint writing)
  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    w1 = await assign("an", "A-W1-VOLCANOES");
    w2 = await assign("an", "A-W2-WATERCYCLE");
    w3 = await assign("an", "A-W3-EARTHQUAKES");
  });
  afterAll(async () => {
    await db?.drop();
  });

  describe("1. policy map, books, RLS, score words, purge", () => {
    it("policy map: catalogue 0.2.1-draft → AP-0.3, insert-only, no app role reads it; the engine policy of both children is AP-0.3 while the catalogue keeps AP-0.2", async () => {
      expect(await q1("select catalogue_version, policy_version from english.engine_policy_map")).toEqual([{ catalogue_version: "0.2.1-draft", policy_version: "AP-0.3" }]);
      expect(await q1("select english.eng_engine_policy($1) as a, english.eng_engine_policy($2) as b", [s.learners.an, s.learners.nguyen])).toEqual([{ a: "AP-0.3", b: "AP-0.3" }]);
      expect(await q1("select assessment_policy_version as v from english.catalogue_versions")).toEqual([{ v: "AP-0.2-pilot" }]);
      expect((await q1<{ n: number }>("select cardinality(english.eng_engine_scope($1)) as n", [s.learners.an]))[0]?.n).toBe(12);
      for (const sql of ["update english.engine_policy_map set note = 'x'", "delete from english.engine_policy_map", "truncate english.engine_policy_map"]) {
        const err = await db.client.query(sql).then(() => null, (e: unknown) => e as { code?: string });
        expect(err?.code, sql).toBe("42501");
      }
      for (const role of ["authenticated", "service_role", "anon"]) {
        expect((await q1<{ ok: boolean }>(`select has_table_privilege('${role}', 'english.engine_policy_map', 'select') as ok`))[0]?.ok, role).toBe(false);
      }
    });

    it("the book refuses every shape that would downgrade or skip a person; it is append-only; nobody (service_role included) writes it or the state directly", async () => {
      const base = { kind: "AUTO", from: "NOT_OBSERVED", to: "SUPPORTED", key: `1-${"b".repeat(16)}` as string | null, engine: "S7a-1" as string | null, by: null as string | null, role: null as string | null, reason: null as string | null, responds: null as string | null, client: null as string | null };
      const ins = (o: Partial<typeof base>) => {
        const v = { ...base, ...o };
        return q1(
          `insert into english.mastery_decisions(learner_id, target_key, kind, from_state, to_state, evidence_key, policy_version, engine_version,
                                                 decided_by_member, decided_role, reason, responds_to, client_id)
           values ($1, $2, $3, $4, $5, $6, 'AP-0.3', $7, $8, $9, $10, $11, $12)`,
          [s.learners.an, SKILL, v.kind, v.from, v.to, v.key, v.engine, v.by, v.role, v.reason, v.responds, v.client],
        );
      };
      const tutor = { by: s.members.tutorAn, role: "tutor", key: null, engine: null };
      for (const bad of [
        { to: "INDEPENDENT" }, // AUTO above level 2
        { from: "DEVELOPING", to: "SUPPORTED" }, // AUTO downward
        { kind: "PROPOSED", to: "DEVELOPING" }, // a proposal below level 3
        { kind: "FLAG", from: "SUPPORTED", to: "SUPPORTED" }, // ⚑ below level 2
        { kind: "MANUAL", to: "INDEPENDENT", reason: "Lý do đủ dài", client: "client-0001", ...tutor }, // a person sets only 1–2 by hand
        { kind: "MANUAL", to: "DEVELOPING", client: "client-0002", ...tutor }, // and with a reason
        { kind: "CONFIRMED", to: "INDEPENDENT", client: "client-0003", ...tutor }, // a confirmation answers a proposal
        { key: "not-a-key" },
        { to: "NEEDS_CONFIRMATION" }, // ⚑ is a flag, never a state (D12)
        { by: s.members.parent, role: "parent" }, // engine rows have no actor; people are tutors
      ]) {
        await fail(ins(bad), "23514");
      }
      await ins({});
      for (const sql of ["update english.mastery_decisions set reason = 'x'", "delete from english.mastery_decisions", "truncate english.mastery_decisions"]) {
        const err = await db.client.query(sql).then(() => null, (e: unknown) => e as { code?: string });
        // TRUNCATE of a table other tables point to is refused by Postgres itself (0A000) before the trigger runs.
        expect(err?.code, sql).toBe(sql.startsWith("truncate") ? "0A000" : "42501");
      }
      const direct = (sql: string) => asCommit(db.client, "service_role", null, (q) => q(sql, [s.learners.an])).then(() => null, (e: unknown) => e as { code?: string });
      expect((await direct(`insert into english.mastery_decisions(learner_id, target_key, kind, from_state, to_state, evidence_key, policy_version, engine_version)
                            values ($1, 'x', 'AUTO', 'NOT_OBSERVED', 'SUPPORTED', '1-${"c".repeat(16)}', 'AP-0.3', 'S7a-1')`))?.code).toBe("42501");
      expect((await direct("insert into english.competency_state(learner_id, target_key) values ($1, 'x')"))?.code).toBe("42501");
    });

    it("RLS: An's tutor and the parent read An's book and state; the student and Nguyên's tutor read nothing", async () => {
      await book(s.learners.an, { target: "A-T4-CAUSE" });
      await q1("select english.eng_project_skill_state($1, 'A-T4-CAUSE')", [s.learners.an]);
      const count = async (user: string, t: string) =>
        (await rowsAs<{ n: number }>(db.client, "authenticated", user, `select count(*)::int as n from english.${t} where learner_id = $1`, [s.learners.an]))[0]?.n;
      for (const t of ["mastery_decisions", "competency_state"]) {
        expect(await count(s.users.tutorAn, t), t).toBeGreaterThan(0);
        expect(await count(s.users.parent, t), t).toBeGreaterThan(0);
        expect(await count(s.users.studentAn, t), t).toBe(0);
        expect(await count(s.users.tutorNguyen, t), t).toBe(0);
        expect((await q1<{ ok: boolean }>(`select has_table_privilege('anon', 'english.${t}', 'select') as ok`))[0]?.ok, t).toBe(false);
      }
      expect(await q1("select state, flag_decision_id, proposal_decision_id from english.competency_state where learner_id = $1 and target_key = 'A-T4-CAUSE'", [s.learners.an]))
        .toEqual([{ state: "SUPPORTED", flag_decision_id: null, proposal_decision_id: null }]);
    });

    it("score words (A): the database and the app agree on every shared sample; of the 0–4 labels only the two upper ones stay refused", async () => {
      for (const [text, hit] of SCORE_WORD_SAMPLES) {
        expect((await q1<{ r: boolean }>("select english.eng_has_score_words($1) as r", [text]))[0]?.r, text).toBe(hit);
      }
      expect((await q1("select english.eng_has_score_words('Chưa thể hiện') as a, english.eng_has_score_words('Còn thiếu nhiều') as b, english.eng_has_score_words('Được một phần') as c, english.eng_has_score_words('Đạt yêu cầu') as d, english.eng_has_score_words('Vững, rõ ràng') as e"))[0])
        .toEqual({ a: false, b: false, c: false, d: true, e: true });
    });

    it("the evidence helper refuses a learner that is not a test learner", async () => {
      await q1("update english.learners set is_test = false where id = $1", [s.learners.nguyen]);
      try {
        const n1 = await assign("nguyen", "B-W1-HOMEWORK");
        await expect(evidence("nguyen", { activityId: await step(n1, 7), daysAgo: 1, scores: { "B-T7-ARGUE": 3 } })).rejects.toThrow(/not a test learner/);
      } finally {
        await q1("update english.learners set is_test = true where id = $1", [s.learners.nguyen]);
      }
    });

    it("the purge removes both tables of one child (receipt and preview count them); the other children keep theirs", async () => {
      const t = await seedThrowawayLearner(db.client);
      await book(t.learnerId);
      await q1("select english.eng_project_skill_state($1, $2)", [t.learnerId, SKILL]);
      const before = await q1<{ n: number }>("select count(*)::int as n from english.mastery_decisions where learner_id = $1", [s.learners.an]);
      const preview = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [t.learnerId]);
      expect(preview.counts).toMatchObject({ mastery_decisions: 1, competency_state: 1 });
      const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1, null) as r", [t.learnerId]);
      expect(receipt.deleted).toMatchObject({ mastery_decisions: 1, competency_state: 1 });
      expect(await q1("select 1 from english.competency_state where learner_id = $1", [t.learnerId])).toEqual([]);
      expect(await q1<{ n: number }>("select count(*)::int as n from english.mastery_decisions where learner_id = $1", [s.learners.an])).toEqual(before);
    });

    it("running every migration again changes nothing", async () => {
      const snap = () => q1("select (select count(*) from english.engine_policy_map)::int as m, (select count(*) from english.mastery_decisions)::int as d, (select count(*) from english.assessment_policies)::int as p");
      const before = await snap();
      await migrate(db.client, true);
      expect(await snap()).toEqual(before);
    });
  });

  // Shared by sections 2–4: the three validated checkpoints of An on "Viết vì sao – nên" (A-W1 11 / A-W2 12 / A-W3 13; 20 / 13 / 5 days ago).
  const proof: { episodeId: string; decisionId: string }[] = [];
  let quizAttempt = "";
  const inputs = (targets: string[] | null = null) =>
    svc<{
      policy: { version: string; config: { receptiveAuto?: { minItems: number } } } | null;
      targets: { key: string; domain: string | null }[];
      episodes: { episode_id: string; facets: Record<string, boolean>; declared_unknown: boolean; scores: { target_key: string; decision_id: string; score: number | null }[] }[];
      auto: { attempt_id: string; items: { item_id: string; target_key: string; result: string }[] }[];
      exposures: { target_key: string; attempt_id: string | null; context_id: string | null }[];
      decisions: unknown[];
    }>("select english.eng_engine_inputs($1, $2::text[]) as r", [s.learners.an, targets]);
  const K = (c: string) => `3-${c.repeat(16)}`;
  type Row = { target_key: string; auto?: string | null; propose?: string | null; raise_flag?: boolean; flag_key?: string | null; route?: number | null; evidence_key?: string; conditions?: unknown; evidence?: { auto: string[]; propose: string[]; flag: string[] } };
  const row = (o: Row) => ({ auto: null, propose: null, raise_flag: false, flag_key: null, route: 1, evidence_key: K("1"), conditions: [], evidence: { auto: [], propose: [], flag: [] }, ...o });
  const apply = (rows: unknown[], learner = s.learners.an, version = "S7a-1") =>
    svc<{ auto: number; proposed: number; flagged: number; policy_version: string }>("select english.eng_apply_engine_results($1, $2::jsonb, $3) as r", [learner, JSON.stringify(rows), version]);
  const stateOf = async (k: string, learner = s.learners.an) =>
    (await q1<{ state: string; flag: boolean; proposal: boolean }>(
      "select state, flag_decision_id is not null as flag, proposal_decision_id is not null as proposal from english.competency_state where learner_id = $1 and target_key = $2", [learner, k]))[0];
  const bookCount = async (learner = s.learners.an) => (await q1<{ n: number }>("select count(*)::int as n from english.mastery_decisions where learner_id = $1", [learner]))[0]!.n;
  /** Answer a proposal / flag straight in the book, as the owner (section 3 tests the real functions). */
  const answer = (id: string, kind: "CONFIRMED" | "REJECTED", from: string, to: string) =>
    q1(`insert into english.mastery_decisions(learner_id, target_key, kind, from_state, to_state, policy_version, decided_by_member, decided_role, reason, responds_to, client_id)
        select learner_id, target_key, $2, $3, $4, 'AP-0.3', $5, 'tutor', 'Lý do thử', id, $6 from english.mastery_decisions where id = $1`,
      [id, kind, from, to, s.members.tutorAn, `answer-${randomUUID()}`]);
  const openOf = async (k: string, kind: "PROPOSED" | "FLAG") =>
    (await q1<{ id: string }>(`select d.id from english.mastery_decisions d where d.learner_id = $1 and d.target_key = $2 and d.kind = $3
                               and not exists (select 1 from english.mastery_decisions a where a.responds_to = d.id)`, [s.learners.an, k, kind]))[0]?.id;

  describe("2. engine inputs, apply, reset", () => {
    beforeAll(async () => {
      for (const [inst, n, daysAgo, score] of [[w1, 11, 20, 3], [w2, 12, 13, 4], [w3, 13, 5, 3]] as const) {
        const e = await evidence("an", { activityId: await step(inst, n), daysAgo, scores: { [SKILL]: score }, facets: ["checkpoint"] });
        proof.push({ episodeId: e.episodeId, decisionId: e.decisionIds[SKILL]! });
      }
      // A real closed answer from the app: An answers W1-R1 (mcq, A-T1-TEXT-R) right on A-W1 step 3.
      const option = template("A-W1-VOLCANOES").steps[2]!.items[0]!.options[1]!;
      const quizStep = await step(w1, 3); // read before switching to the student's role (q1 runs on the same connection)
      const receipt = await asCommit(db.client, "authenticated", s.users.studentAn, async (q) =>
        ((await q("select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], 'in_app') as r", [quizStep, randomUUID(), JSON.stringify({ answers: { "W1-R1": option } }), ["none"]])).rows[0] as { r: { attempt_id: string } }).r);
      quizAttempt = receipt.attempt_id;
    });

    it("inputs: AP-0.3 with receptiveAuto, the 12 skills of A-v1 with their domains, the validated episodes and the auto-checked items", async () => {
      const r = await inputs();
      expect(r.policy?.version).toBe("AP-0.3");
      expect(r.policy?.config.receptiveAuto?.minItems).toBe(8);
      expect(r.targets).toHaveLength(12);
      expect(r.targets.find((t) => t.key === "A-T1-TEXT-R")?.domain).toBe("reading");
      expect(r.targets.find((t) => t.key === SKILL)?.domain).toBe("writing");
      const mine = r.episodes.filter((e) => e.scores.some((x) => x.target_key === SKILL));
      expect(mine.map((e) => e.scores.find((x) => x.target_key === SKILL)?.decision_id)).toEqual(proof.map((p) => p.decisionId));
      expect(mine.every((e) => e.facets.checkpoint && !e.declared_unknown)).toBe(true);
      expect(r.auto.find((a) => a.attempt_id === quizAttempt)?.items).toEqual([{ item_id: "W1-R1", target_key: "A-T1-TEXT-R", result: "correct" }]);
      expect(r.episodes.some((e) => e.scores.length === 0)).toBe(false); // the quiz has no decision: it is not an "episode" input
      const practice = r.exposures.filter((x) => x.target_key === SKILL);
      expect(practice).toHaveLength(3);
      expect(practice.every((x) => x.context_id !== null && x.attempt_id !== null)).toBe(true);
    });

    it("inputs follow the CURRENT decision (a MODIFY replaces the AGREE) and keep only skills of the set (D11)", async () => {
      const old = proof[1]!.decisionId;
      const [m] = await q1<{ id: string }>(
        `insert into english.validation_decisions(episode_id, learner_id, target_key, decision, final_score, validator_member_id, validator_role, reason, supersedes_id)
         values ($1, $2, $3, 'MODIFY', 3, $4, 'tutor', 'Sửa lại sau khi đọc kỹ', $5) returning id`,
        [proof[1]!.episodeId, s.learners.an, SKILL, s.members.tutorAn, old]);
      proof[1]!.decisionId = m!.id;
      const r = await inputs([SKILL, "A-A3-REDRAFT"]);
      expect(r.targets.map((t) => t.key)).toEqual([SKILL]);
      const scores = r.episodes.flatMap((e) => e.scores);
      expect(scores.find((x) => x.decision_id === old)).toBeUndefined();
      expect(scores.find((x) => x.decision_id === m!.id)?.score).toBe(3);
      expect(r.auto).toEqual([]); // the quiz has no item of SKILL
    });

    it("apply: AUTO + PROPOSED once; the same results again write nothing; AUTO never goes down; one open proposal", async () => {
      const k = "A-L3-PARA-W";
      const ev = { auto: [proof[0]!.episodeId], propose: proof.map((p) => p.episodeId), flag: [] };
      expect(await apply([row({ target_key: k, auto: "DEVELOPING", propose: "INDEPENDENT", evidence: ev })])).toMatchObject({ auto: 1, proposed: 1, flagged: 0, policy_version: "AP-0.3" });
      expect(await stateOf(k)).toEqual({ state: "DEVELOPING", flag: false, proposal: true });
      const n = await bookCount();
      expect(await apply([row({ target_key: k, auto: "DEVELOPING", propose: "INDEPENDENT", evidence: ev })])).toMatchObject({ auto: 0, proposed: 0, flagged: 0 });
      expect(await apply([row({ target_key: k, auto: "SUPPORTED" })])).toMatchObject({ auto: 0 });
      expect(await apply([row({ target_key: k, propose: "INDEPENDENT", evidence_key: K("2") })])).toMatchObject({ proposed: 0 });
      expect(await bookCount()).toBe(n);
      const [p] = await q1<{ from_state: string; to_state: string; evidence_episode_ids: string[] }>(
        "select from_state, to_state, evidence_episode_ids from english.mastery_decisions where learner_id = $1 and target_key = $2 and kind = 'PROPOSED'", [s.learners.an, k]);
      expect(p).toEqual({ from_state: "DEVELOPING", to_state: "INDEPENDENT", evidence_episode_ids: [...ev.propose].sort() });
    });

    it("apply: after 'Chưa' the same evidence key is never proposed again; another key is (D13)", async () => {
      const k = "A-L3-PARA-W";
      await answer((await openOf(k, "PROPOSED"))!, "REJECTED", "DEVELOPING", "DEVELOPING");
      expect(await stateOf(k)).toMatchObject({ state: "DEVELOPING" }); // the projection runs on the next apply
      expect(await apply([row({ target_key: k, propose: "INDEPENDENT", evidence_key: K("1") })])).toMatchObject({ proposed: 0 });
      expect(await stateOf(k)).toEqual({ state: "DEVELOPING", flag: false, proposal: false });
      expect(await apply([row({ target_key: k, propose: "INDEPENDENT", evidence_key: K("2") })])).toMatchObject({ proposed: 1 });
    });

    it("apply: ⚑ keeps the level, only one open, never twice for the same evidence, never below level 2; level 4 only from Tự làm được", async () => {
      const k = "A-L3-PARA-W";
      expect(await apply([row({ target_key: k, raise_flag: true, flag_key: K("f") })])).toMatchObject({ flagged: 1 });
      expect(await stateOf(k)).toEqual({ state: "DEVELOPING", flag: true, proposal: true });
      expect(await apply([row({ target_key: k, raise_flag: true, flag_key: K("e") })])).toMatchObject({ flagged: 0 }); // one open ⚑
      await answer((await openOf(k, "FLAG"))!, "CONFIRMED", "DEVELOPING", "DEVELOPING");
      expect(await apply([row({ target_key: k, raise_flag: true, flag_key: K("f") })])).toMatchObject({ flagged: 0 }); // same evidence
      expect(await apply([row({ target_key: k, raise_flag: true, flag_key: K("e") })])).toMatchObject({ flagged: 1 }); // new evidence
      expect(await apply([row({ target_key: "A-L1-PAST-W", auto: "SUPPORTED" }), row({ target_key: "A-L1-PAST-W", raise_flag: true, flag_key: K("d") })])).toMatchObject({ auto: 1, flagged: 0 });
      expect(await apply([row({ target_key: "A-L2-CHUNKS", propose: "TRANSFERABLE", evidence_key: K("4") })])).toMatchObject({ proposed: 0 });
    });

    it("apply stores the latest conditions and route; refuses skills outside the set, bad keys, routes and versions; app roles cannot call it", async () => {
      const cond = [{ id: "l1_evidence", level: 1, route: 1, have: 1, need: 1, met: true, evidence: [] }];
      await apply([row({ target_key: "A-L2-COMPENSATE-S", conditions: cond, route: 2 })]);
      expect(await q1("select conditions, route, evaluated_at is not null as at from english.competency_state where learner_id = $1 and target_key = 'A-L2-COMPENSATE-S'", [s.learners.an]))
        .toEqual([{ conditions: cond, route: 2, at: true }]);
      await fail(apply([row({ target_key: "A-A3-REDRAFT" })]), "22023", /not_in_set/);
      await fail(apply([row({ target_key: SKILL, evidence_key: "x" })]), "22023", /bad_results/);
      await fail(apply([row({ target_key: SKILL, route: 3 })]), "22023", /bad_results/);
      await fail(apply([row({ target_key: SKILL, conditions: {} })]), "22023", /bad_results/);
      await fail(apply([], s.learners.an, "bad version!"), "22023", /bad_results/);
      for (const fn of ["eng_engine_inputs(uuid, text[])", "eng_apply_engine_results(uuid, jsonb, text)", "eng_reset_skill_states(uuid, uuid)"]) {
        expect((await q1<{ ok: boolean }>(`select has_function_privilege('authenticated', 'english.${fn}', 'execute') as ok`))[0]?.ok, fn).toBe(false);
        expect((await q1<{ ok: boolean }>(`select has_function_privilege('service_role', 'english.${fn}', 'execute') as ok`))[0]?.ok, fn).toBe(true);
      }
    });

    it("reset: the parent or An's tutor rebuilds An's state from the book (same levels, ⚑ and proposals); Nguyên's tutor cannot", async () => {
      const snap = () => q1("select target_key, state, state_decision_id, flag_decision_id, proposal_decision_id from english.competency_state where learner_id = $1 order by target_key", [s.learners.an]);
      const before = await snap();
      const n = await bookCount();
      expect(await svc<{ targets: number }>("select english.eng_reset_skill_states($1, $2) as r", [s.learners.an, s.members.parent])).toMatchObject({ targets: expect.any(Number) });
      const first = await snap();
      expect(first).toEqual(expect.arrayContaining(before)); // every row that existed comes back the same; the other skills of the set get a row
      expect(first.length).toBeGreaterThanOrEqual(12);
      expect(await svc("select english.eng_reset_skill_states($1, $2) as r", [s.learners.an, s.members.tutorAn])).toMatchObject({ targets: first.length });
      expect(await snap()).toEqual(first); // twice → the same
      expect(await bookCount()).toBe(n);
      await fail(svc("select english.eng_reset_skill_states($1, $2) as r", [s.learners.an, s.members.tutorNguyen]), "42501", /staff_only/);
      expect((await q1<{ n: number }>("select count(*)::int as n from english.audit_log where learner_id = $1 and action = 'skill_states.rebuilt'", [s.learners.an]))[0]?.n).toBe(2);
    });
  });

  // (Tasks 6 and 7 add their sections here)
});
