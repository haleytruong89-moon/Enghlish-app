import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../../lib/config/content";
import { projectDecisions } from "../../lib/engine/project";
import { rebuildLearner, recomputeLearner } from "../../lib/engine/runner";
import { parseEngineInputs, sliceTarget } from "../../lib/engine/shape";
import { ENGINE_VERSION } from "../../lib/engine/types";
import type { InquiryTemplate } from "../../lib/config/schemas";
import { addDays, daysBetween, todayVn } from "../../lib/inquiries/dates";
import { pgEngineStore } from "../../scripts/lib/enginePg";
import { applyMigrations, listMigrations } from "../../scripts/lib/migrate";
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
  type Row = {
    target_key: string; auto?: string | null; auto_route?: number | null; propose?: string | null; propose_key?: string | null; raise_flag?: boolean; flag_key?: string | null;
    route?: number | null; evidence_key?: string; conditions?: unknown; evidence?: { auto: string[]; propose: string[]; flag: string[] }; computed_at?: string;
  };
  /** propose_key defaults to evidence_key (these tests give one key per row); auto_route to route. */
  const row = (o: Row) => {
    const r = { auto: null, propose: null, raise_flag: false, flag_key: null, route: 1, evidence_key: K("1"), conditions: [], evidence: { auto: [], propose: [], flag: [] }, ...o };
    return { ...r, propose_key: o.propose_key !== undefined ? o.propose_key : r.propose ? r.evidence_key : null };
  };
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

  describe("3. the tutor decides, the parent reads, the student gets nothing", () => {
    type Out = { id: string; target_key?: string; ids?: string[]; replayed: boolean };
    const decide = (decision: string, action: string, by: string, reason: string | null = null, clientId = `decide-${randomUUID()}`) =>
      svc<Out>("select english.eng_decide_skill($1, $2, $3, $4, $5) as r", [decision, action, reason, by, clientId]);
    const confirmAll = (ids: string[], by: string, clientId = `all-${randomUUID()}`, learner = s.learners.an) =>
      svc<Out>("select english.eng_confirm_skill_proposals($1, $2::uuid[], $3, $4) as r", [learner, ids, by, clientId]);
    const manual = (target: string, state: string, reason: string | null, by: string, clientId = `manual-${randomUUID()}`) =>
      svc<Out>("select english.eng_set_skill_state($1, $2, $3, $4, $5, $6) as r", [s.learners.an, target, state, reason, by, clientId]);
    const ev = () => ({ auto: [], propose: proof.map((p) => p.episodeId), flag: [proof[2]!.episodeId] });
    let p1 = ""; // A-T7-OPINION: DEVELOPING → INDEPENDENT (to reject, then confirm a new one)
    let p2 = ""; // A-X1-TURN: DEVELOPING → INDEPENDENT (confirm-all)
    let p3 = ""; // A-L4-PROCESS-S: DEVELOPING → INDEPENDENT (confirm-all)
    let f1 = ""; // A-L4-PROCESS-S ⚑
    beforeAll(async () => {
      await apply([
        row({ target_key: "A-T7-OPINION", auto: "DEVELOPING", propose: "INDEPENDENT", evidence_key: K("7"), evidence: ev() }),
        row({ target_key: "A-X1-TURN", auto: "DEVELOPING", propose: "INDEPENDENT", evidence_key: K("8"), evidence: ev() }),
        row({ target_key: "A-L4-PROCESS-S", auto: "DEVELOPING", propose: "INDEPENDENT", raise_flag: true, flag_key: K("9"), evidence_key: K("9"), evidence: ev() }),
      ]);
      [p1, p2, p3, f1] = [await openOf("A-T7-OPINION", "PROPOSED"), await openOf("A-X1-TURN", "PROPOSED"), await openOf("A-L4-PROCESS-S", "PROPOSED"), await openOf("A-L4-PROCESS-S", "FLAG")] as [string, string, string, string];
    });

    it("only An's tutor answers: the parent and Nguyên's tutor get 42501 (tutor_only); no app role can execute the functions", async () => {
      await fail(decide(p1, "confirm", s.members.parent), "42501", /tutor_only/);
      await fail(decide(p1, "confirm", s.members.tutorNguyen), "42501", /tutor_only/);
      await fail(confirmAll([p2], s.members.parent), "42501", /tutor_only/);
      await fail(manual("A-T7-OPINION", "SUPPORTED", "Lý do thử", s.members.parent), "42501", /tutor_only/);
      for (const fn of ["eng_decide_skill(uuid, text, text, uuid, text)", "eng_confirm_skill_proposals(uuid, uuid[], uuid, text)", "eng_set_skill_state(uuid, text, text, text, uuid, text, text)", "eng_skill_states(uuid)", "eng_skill_inbox(uuid, boolean)"]) {
        expect((await q1<{ ok: boolean }>(`select has_function_privilege('authenticated', 'english.${fn}', 'execute') as ok`))[0]?.ok, fn).toBe(false);
      }
    });

    it("'Chưa' needs a reason, keeps the level and closes the proposal; a second answer is refused; the same request again is a replay", async () => {
      await fail(decide(p1, "reject", s.members.tutorAn, " x "), "23514", /reason_required/);
      const out = await decide(p1, "reject", s.members.tutorAn, "Bài thứ ba còn dựa vào câu mẫu", "decide-reject-0001");
      expect(out).toMatchObject({ target_key: "A-T7-OPINION", replayed: false });
      expect(await stateOf("A-T7-OPINION")).toEqual({ state: "DEVELOPING", flag: false, proposal: false });
      expect(await decide(p1, "reject", s.members.tutorAn, "Bài thứ ba còn dựa vào câu mẫu", "decide-reject-0001")).toMatchObject({ id: out.id, replayed: true });
      await fail(decide(p1, "confirm", s.members.tutorAn), "23505", /already_answered/);
      // the receipt names the decision, never the reason
      expect(await q1("select payload ? 'reason' as has_reason from english.audit_log where learner_id = $1 and action = 'skill.rejected'", [s.learners.an])).toEqual([{ has_reason: false }]);
    });

    it("'Xác nhận' moves the level; 'Giữ bậc' keeps it and closes ⚑; a ⚑ is never rejected", async () => {
      expect(await apply([row({ target_key: "A-T7-OPINION", propose: "INDEPENDENT", evidence_key: K("6"), evidence: ev() })])).toMatchObject({ proposed: 1 });
      await decide((await openOf("A-T7-OPINION", "PROPOSED"))!, "confirm", s.members.tutorAn);
      expect(await stateOf("A-T7-OPINION")).toEqual({ state: "INDEPENDENT", flag: false, proposal: false });
      await fail(decide(f1, "reject", s.members.tutorAn, "Không đồng ý"), "22023", /flag_keep_or_edit/);
      await decide(f1, "confirm", s.members.tutorAn);
      expect(await stateOf("A-L4-PROCESS-S")).toEqual({ state: "DEVELOPING", flag: false, proposal: true });
    });

    it("'Xác nhận tất cả' confirms exactly the shown proposals, refuses a ⚑, is all-or-nothing and replayable", async () => {
      expect(await apply([row({ target_key: "A-L4-PROCESS-S", raise_flag: true, flag_key: K("a") })])).toMatchObject({ flagged: 1 });
      const f2 = (await openOf("A-L4-PROCESS-S", "FLAG"))!;
      const n = await bookCount();
      await fail(confirmAll([p2, f2], s.members.tutorAn), "22023", /flag_not_bulk/);
      await fail(confirmAll([p2, p2], s.members.tutorAn), "22023", /bad_ids/);
      await fail(confirmAll([p2, randomUUID()], s.members.tutorAn), "P0002");
      expect(await bookCount()).toBe(n);
      const out = await confirmAll([p2, p3], s.members.tutorAn, "all-0000-0001");
      expect(out.ids).toHaveLength(2);
      expect(await confirmAll([p3, p2], s.members.tutorAn, "all-0000-0001")).toMatchObject({ replayed: true });
      expect([await stateOf("A-X1-TURN"), await stateOf("A-L4-PROCESS-S")]).toEqual([
        { state: "INDEPENDENT", flag: false, proposal: false },
        { state: "INDEPENDENT", flag: true, proposal: false },
      ]);
      await fail(confirmAll([p2], s.members.tutorAn), "23505", /already_answered/);
    });

    it("manual: only levels 1–2, a reason, a skill of the set, a different level; it closes an open ⚑ (G3)", async () => {
      await fail(manual("A-L4-PROCESS-S", "INDEPENDENT", "Lý do đủ dài", s.members.tutorAn), "22023", /manual_levels_1_2/);
      await fail(manual("A-L4-PROCESS-S", "DEVELOPING", " ", s.members.tutorAn), "23514", /reason_required/);
      await fail(manual("A-A3-REDRAFT", "DEVELOPING", "Lý do đủ dài", s.members.tutorAn), "22023", /not_in_set/);
      const out = await manual("A-L4-PROCESS-S", "DEVELOPING", "Hai bài gần đây đều cần câu mẫu", s.members.tutorAn, "manual-0000-0001");
      expect(await stateOf("A-L4-PROCESS-S")).toEqual({ state: "DEVELOPING", flag: false, proposal: false });
      expect(await manual("A-L4-PROCESS-S", "DEVELOPING", "Hai bài gần đây đều cần câu mẫu", s.members.tutorAn, "manual-0000-0001")).toMatchObject({ id: out.id, replayed: true });
      await fail(manual("A-L4-PROCESS-S", "DEVELOPING", "Lý do khác", s.members.tutorAn), "23514", /same_state/);
    });

    it("eng_skill_states: the 12 skills of A-v1 in set order with state, kind, ⚑, proposal, domain and title", async () => {
      const r = await svc<{ policy_version: string; set_id: string; rows: { target_key: string; title_vi: string; domain_key: string; state: string; state_kind: string | null; flag: unknown; proposal: unknown }[] }>(
        "select english.eng_skill_states($1) as r", [s.learners.an]);
      expect([r.policy_version, r.set_id]).toEqual(["AP-0.3", "A-v1"]);
      expect(r.rows.map((x) => x.target_key)).toEqual((await q1<{ t: string[] }>("select target_ids as t from english.target_set_definitions where id = 'A-v1'"))[0]!.t);
      expect(r.rows.find((x) => x.target_key === "A-X1-TURN")).toMatchObject({ state: "INDEPENDENT", state_kind: "CONFIRMED", flag: null, proposal: null, domain_key: "speaking" });
      expect(r.rows.find((x) => x.target_key === "A-L4-PROCESS-S")).toMatchObject({ state: "DEVELOPING", state_kind: "MANUAL" });
      expect(r.rows.find((x) => x.target_key === "A-T1-TEXT-R")).toMatchObject({ state: "NOT_OBSERVED", state_kind: null, domain_key: "reading" });
      expect(r.rows.every((x) => typeof x.title_vi === "string" && x.title_vi.length > 0)).toBe(true);
    });

    it("eng_skill_inbox: An's tutor can decide An's open items (with evidence links); the parent sees them read-only; Nguyên's tutor sees none; a student is refused", async () => {
      expect(await apply([row({ target_key: "A-L3-CAUSE-S", auto: "DEVELOPING", propose: "INDEPENDENT", evidence_key: K("b"), evidence: ev() })])).toMatchObject({ proposed: 1 });
      type Inbox = { open: number; decidable: number; items: { kind: string; learner_id: string; target_key: string; can_decide: boolean; evidence: { episode_id: string; step_no: number }[] }[] };
      const tutor = await svc<Inbox>("select english.eng_skill_inbox($1, false) as r", [s.members.tutorAn]);
      const mine = tutor.items.find((i) => i.target_key === "A-L3-CAUSE-S")!;
      expect(mine).toMatchObject({ kind: "PROPOSED", learner_id: s.learners.an, can_decide: true });
      expect(mine.evidence.map((e) => e.episode_id)).toEqual(proof.map((p) => p.episodeId));
      expect(mine.evidence.map((e) => e.step_no)).toEqual([11, 12, 13]);
      expect(tutor.decidable).toBe(tutor.open);
      const parent = await svc<Inbox>("select english.eng_skill_inbox($1, false) as r", [s.members.parent]);
      expect(parent.items.map((i) => i.target_key)).toEqual(tutor.items.map((i) => i.target_key));
      expect(parent.items.every((i) => !i.can_decide)).toBe(true);
      expect(parent.decidable).toBe(0);
      expect((await svc<Inbox>("select english.eng_skill_inbox($1, false) as r", [s.members.tutorNguyen])).items.filter((i) => i.learner_id === s.learners.an)).toEqual([]);
      await fail(svc("select english.eng_skill_inbox($1, false) as r", [s.members.studentAn]), "42501", /staff_only/);
    });
  });

  describe("3b. G4: the reviewer marks work as a new topic / source (episode_marks)", () => {
    const mark = (episode: string, value: boolean, by: string) => svc<{ value: boolean; replayed: boolean }>("select english.eng_mark_episode_transfer($1, $2, $3) as r", [episode, value, by]);
    const marksOf = (episode: string) => q1<{ value: boolean }>("select value from english.episode_marks where episode_id = $1 order by seq", [episode]);
    const transferMarked = async (episode: string) =>
      (await inputs()).episodes.find((e) => e.episode_id === episode) as unknown as { transfer_marked: boolean } | undefined;
    let open: { episodeId: string }; // not restricted: no in-session test, not watched live

    beforeAll(async () => {
      open = await evidence("an", { activityId: await step(w2, 7), daysAgo: 2, scores: { "A-T4-CAUSE": 3 } });
    });

    it("An's tutor marks and unmarks (the latest row wins); the same value again writes nothing; the engine inputs follow", async () => {
      const ep = proof[0]!.episodeId;
      expect((await transferMarked(ep))?.transfer_marked).toBe(false);
      expect(await mark(ep, true, s.members.tutorAn)).toEqual({ value: true, replayed: false });
      expect(await mark(ep, true, s.members.tutorAn)).toEqual({ value: true, replayed: true });
      expect((await transferMarked(ep))?.transfer_marked).toBe(true);
      expect(await mark(ep, false, s.members.tutorAn)).toEqual({ value: false, replayed: false });
      expect((await transferMarked(ep))?.transfer_marked).toBe(false);
      expect(await marksOf(ep)).toEqual([{ value: true }, { value: false }]);
      expect((await q1<{ n: number }>("select count(*)::int as n from english.audit_log where learner_id = $1 and action = 'episode.transfer_marked'", [s.learners.an]))[0]?.n).toBe(2);
    });

    it("S1: only the child's tutor marks - the parent is refused even on ordinary work; Nguyên's tutor and the student are refused too", async () => {
      await fail(mark(open.episodeId, true, s.members.parent), "42501", /tutor_only/);
      await fail(mark(proof[0]!.episodeId, true, s.members.parent), "42501", /not_reviewer/); // an in-session test: not even a reviewer
      await fail(mark(open.episodeId, true, s.members.tutorNguyen), "42501", /not_reviewer/);
      await fail(mark(open.episodeId, true, s.members.studentAn), "42501", /not_reviewer/);
      expect(await marksOf(open.episodeId)).toEqual([]);
      expect(await marksOf(proof[0]!.episodeId)).toHaveLength(2);
      expect(await mark(open.episodeId, true, s.members.tutorAn)).toMatchObject({ replayed: false });
      expect(await mark(open.episodeId, false, s.members.tutorAn)).toMatchObject({ replayed: false });
    });

    it("only a first attempt that is not a revision; unknown episode; app roles cannot execute the function", async () => {
      const retry = await evidence("an", { activityId: await step(w2, 7), daysAgo: 1, scores: { "A-T4-CAUSE": 3 }, mode: "REVISION", facets: ["revision"] });
      await fail(mark(retry.episodeId, true, s.members.tutorAn), "22023", /first_attempt_only/);
      await fail(mark(randomUUID(), true, s.members.tutorAn), "P0002");
      expect((await q1<{ ok: boolean }>("select has_function_privilege('authenticated', 'english.eng_mark_episode_transfer(uuid, boolean, uuid)', 'execute') as ok"))[0]?.ok).toBe(false);
    });

    it("the marks are append-only, staff read them (the student does not), and the purge counts them", async () => {
      for (const sql of ["update english.episode_marks set value = false", "delete from english.episode_marks", "truncate english.episode_marks"]) {
        const err = await db.client.query(sql).then(() => null, (e: unknown) => e as { code?: string });
        expect(err?.code, sql).toBe("42501");
      }
      const count = async (user: string) => (await rowsAs<{ n: number }>(db.client, "authenticated", user, "select count(*)::int as n from english.episode_marks where learner_id = $1", [s.learners.an]))[0]?.n;
      expect(await count(s.users.tutorAn)).toBeGreaterThan(0);
      expect(await count(s.users.parent)).toBeGreaterThan(0);
      expect(await count(s.users.studentAn)).toBe(0);
      expect(await count(s.users.tutorNguyen)).toBe(0);
    });
  });

  describe("4. the TypeScript engine on the real database (runner + pg store)", () => {
    const store = () => pgEngineStore(db.client);
    const snap = () => q1("select target_key, state, state_decision_id, flag_decision_id, proposal_decision_id, conditions, route from english.competency_state where learner_id = $1 order by target_key", [s.learners.an]);

    it("recompute: the three checkpoints make SKILL 'Đang tiến bộ' (AUTO) with a proposal 'Tự làm được' that cites them; again → nothing new", async () => {
      const r = await recomputeLearner(store(), s.learners.an, null);
      expect(r.results).toHaveLength(12);
      expect(r.results.find((x) => x.targetKey === SKILL)).toMatchObject({ evidenceState: "INDEPENDENT", route: 1, auto: "DEVELOPING", propose: "INDEPENDENT" });
      expect(await stateOf(SKILL)).toEqual({ state: "DEVELOPING", flag: false, proposal: true });
      expect(await q1("select evidence_episode_ids, policy_version, engine_version from english.mastery_decisions where learner_id = $1 and target_key = $2 and kind = 'PROPOSED'", [s.learners.an, SKILL]))
        .toEqual([{ evidence_episode_ids: proof.map((p) => p.episodeId).sort(), policy_version: "AP-0.3", engine_version: ENGINE_VERSION }]);
      const n = await bookCount();
      expect((await recomputeLearner(store(), s.learners.an, null)).applied).toMatchObject({ auto: 0, proposed: 0, flagged: 0 });
      expect(await bookCount()).toBe(n);
    });

    it("rebuild twice: the same levels, ⚑, proposals and conditions, and no new row in the book (UAT-16)", async () => {
      const before = await snap();
      const n = await bookCount();
      await rebuildLearner(store(), s.learners.an, s.members.tutorAn);
      expect(await snap()).toEqual(before);
      await rebuildLearner(store(), s.learners.an, s.members.parent);
      expect(await snap()).toEqual(before);
      expect(await bookCount()).toBe(n);
    });

    it("the TypeScript projection and the SQL projection agree on every skill", async () => {
      const inputs = parseEngineInputs(await store().loadInputs(s.learners.an, null));
      const rows = await q1<{ target_key: string; state: string; state_decision_id: string | null; flag_decision_id: string | null; proposal_decision_id: string | null }>(
        "select target_key, state, state_decision_id, flag_decision_id, proposal_decision_id from english.competency_state where learner_id = $1", [s.learners.an]);
      for (const t of inputs.targets) {
        const p = projectDecisions(sliceTarget(inputs, t.key).decisions);
        const row = rows.find((x) => x.target_key === t.key)!;
        expect({ state: p.state, s: p.stateDecisionId, f: p.openFlag?.id ?? null, p: p.openProposal?.id ?? null }, t.key)
          .toEqual({ state: row.state, s: row.state_decision_id, f: row.flag_decision_id, p: row.proposal_decision_id });
      }
    });

    it("the real path: An's closed answer in the app reaches the engine as route-2 evidence of A-T1-TEXT-R (1 item - not enough yet)", async () => {
      const r = await recomputeLearner(store(), s.learners.an, ["A-T1-TEXT-R"]);
      expect(r.results.map((x) => x.targetKey)).toEqual(["A-T1-TEXT-R"]);
      expect(r.results[0]!.conditions.find((c) => c.id === "r2_items")).toMatchObject({ have: 1, need: 8, met: false });
    });

    it("confirm through the function, then recompute: 'Tự làm được' and nothing new to propose", async () => {
      await svc("select english.eng_decide_skill($1, 'confirm', null, $2, $3) as r", [(await openOf(SKILL, "PROPOSED"))!, s.members.tutorAn, `decide-${randomUUID()}`]);
      const n = await bookCount();
      await recomputeLearner(store(), s.learners.an, [SKILL]);
      expect(await stateOf(SKILL)).toEqual({ state: "INDEPENDENT", flag: false, proposal: false });
      expect(await bookCount()).toBe(n);
    });

    it("after 'Chưa' a recompute does not propose again; helped work that no condition counts does not bring it back (S3); one more qualifying piece does (D13)", async () => {
      const T = "A-T4-CAUSE"; // speaking checkpoints A-W1 8 / A-W2 9 / A-W3 10, first attempts
      for (const [inst, n, daysAgo] of [[w1, 8, 21], [w2, 9, 14], [w3, 10, 6]] as const) {
        await evidence("an", { activityId: await step(inst, n), daysAgo, scores: { [T]: 3 }, facets: ["checkpoint"] });
      }
      expect((await recomputeLearner(store(), s.learners.an, [T])).applied).toMatchObject({ proposed: 1 });
      await svc("select english.eng_decide_skill($1, 'reject', 'Chưa đủ chắc ở bài nói', $2, $3) as r", [(await openOf(T, "PROPOSED"))!, s.members.tutorAn, `decide-${randomUUID()}`]);
      expect((await recomputeLearner(store(), s.learners.an, [T])).applied.proposed).toBe(0);
      await evidence("an", { activityId: await step(w1, 4), daysAgo: 2, mode: "PRACTICE", scores: { [T]: 1 } });
      expect((await recomputeLearner(store(), s.learners.an, [T])).applied.proposed).toBe(0); // a helped 1/4: new evidence, but not counted by level 3
      await evidence("an", { activityId: await step(w3, 5), daysAgo: 1, scores: { [T]: 3 } });
      expect((await recomputeLearner(store(), s.learners.an, [T])).applied.proposed).toBe(1);
      expect(await stateOf(T)).toEqual({ state: "DEVELOPING", flag: false, proposal: true });
    });

    it("G4 end to end: a delayed check (template mark) + the tutor's 'new topic' mark on another piece of work → PROPOSED 'Vận dụng được'; confirm moves the level", async () => {
      // SKILL is 'Tự làm được' (confirmed above). A delayed check on A-W1, 19 days after its last practice there:
      const delayed = await evidence("an", { activityId: await step(w1, 6), daysAgo: 1, scores: { [SKILL]: 3 }, facets: ["delayed_check"] });
      const transfer = await evidence("an", { activityId: await step(w2, 6), daysAgo: 1, scores: { [SKILL]: 3 } });
      expect((await recomputeLearner(store(), s.learners.an, [SKILL])).applied.proposed).toBe(0); // no transfer evidence yet
      await svc("select english.eng_mark_episode_transfer($1, true, $2) as r", [transfer.episodeId, s.members.tutorAn]);
      const r = await recomputeLearner(store(), s.learners.an, [SKILL]);
      expect(r.results[0]).toMatchObject({ currentState: "INDEPENDENT", evidenceState: "TRANSFERABLE", propose: "TRANSFERABLE" });
      expect(r.results[0]!.evidence.propose.sort()).toEqual([delayed.episodeId, transfer.episodeId].sort());
      await svc("select english.eng_decide_skill($1, 'confirm', null, $2, $3) as r", [(await openOf(SKILL, "PROPOSED"))!, s.members.tutorAn, `decide-${randomUUID()}`]);
      expect(await stateOf(SKILL)).toEqual({ state: "TRANSFERABLE", flag: false, proposal: false });
      const n = await bookCount();
      await recomputeLearner(store(), s.learners.an, null);
      expect(await bookCount()).toBe(n);
    });
  });

  describe("5. review fixes: B1 level 4, B2 hand-set levels, S1-S3, N2, N5, N7", () => {
    const store = () => pgEngineStore(db.client);
    const decideRow = (decision: string, by = s.members.tutorAn) =>
      svc("select english.eng_decide_skill($1, 'confirm', null, $2, $3) as r", [decision, by, `fix-${randomUUID()}`]);
    const markT = (episode: string, value: boolean, by = s.members.tutorAn) => svc("select english.eng_mark_episode_transfer($1, $2, $3) as r", [episode, value, by]);
    const manualAt = async (target: string, state: string, key: string | null) =>
      svc("select english.eng_set_skill_state($1, $2, $3, 'Em cần thêm câu mẫu', $4, $5, $6) as r", [s.learners.an, target, state, s.members.tutorAn, `fix-manual-${randomUUID()}`, key]);
    const proposals = (k: string) => q1<{ to_state: string; evidence_key: string }>(
      "select to_state, evidence_key from english.mastery_decisions where learner_id = $1 and target_key = $2 and kind = 'PROPOSED' order by seq", [s.learners.an, k]);
    /** Three unaided first attempts (5 days: spread over 14 days, two topics, one in-session test) + a delayed check on W1 and a transfer on W3. */
    async function level4Evidence(k: string, steps: { w1: number[]; w2: number[]; w3: number }, transferFacet: boolean) {
      await evidence("an", { activityId: await step(w1, steps.w1[0]!), daysAgo: 40, scores: { [k]: 3 }, facets: ["checkpoint"] });
      await evidence("an", { activityId: await step(w2, steps.w2[0]!), daysAgo: 33, scores: { [k]: 3 } });
      await evidence("an", { activityId: await step(w2, steps.w2[1]!), daysAgo: 26, scores: { [k]: 3 } });
      await evidence("an", { activityId: await step(w1, steps.w1[1]!), daysAgo: 3, scores: { [k]: 3 }, facets: ["delayed_check"] });
      return evidence("an", { activityId: await step(w3, steps.w3), daysAgo: 2, scores: { [k]: 3 }, facets: transferFacet ? ["transfer_check"] : [] });
    }

    it("B1: level 3 confirmed while the delayed and transfer work already existed → the next run PROPOSES level 4 with no new evidence", async () => {
      const k = "A-L2-CHUNKS";
      await level4Evidence(k, { w1: [1, 2], w2: [1, 2], w3: 1 }, true);
      expect((await recomputeLearner(store(), s.learners.an, [k])).applied).toMatchObject({ auto: 1, proposed: 1 });
      expect((await proposals(k)).map((p) => p.to_state)).toEqual(["INDEPENDENT"]);
      await decideRow((await openOf(k, "PROPOSED"))!);
      const r = await recomputeLearner(store(), s.learners.an, [k]);
      expect(r.applied).toMatchObject({ proposed: 1 });
      expect(r.results[0]).toMatchObject({ currentState: "INDEPENDENT", propose: "TRANSFERABLE" });
      const rows = await proposals(k);
      expect(rows.map((p) => p.to_state)).toEqual(["INDEPENDENT", "TRANSFERABLE"]);
      expect(rows[0]!.evidence_key).not.toBe(rows[1]!.evidence_key);
      const n = await bookCount();
      expect((await recomputeLearner(store(), s.learners.an, [k])).applied).toMatchObject({ proposed: 0 }); // one open proposal, same evidence
      expect(await bookCount()).toBe(n);
    });

    it("B1: level 3 confirmed, then the tutor ticks the transfer mark on an episode that was already there → PROPOSED level 4", async () => {
      const k = "A-T1-TEXT-L";
      const transfer = await level4Evidence(k, { w1: [5, 7], w2: [3, 4], w3: 2 }, false);
      await recomputeLearner(store(), s.learners.an, [k]);
      await decideRow((await openOf(k, "PROPOSED"))!);
      expect((await recomputeLearner(store(), s.learners.an, [k])).applied.proposed).toBe(0); // no transfer evidence yet
      await markT(transfer.episodeId, true);
      const r = await recomputeLearner(store(), s.learners.an, [k]);
      expect(r.results[0]).toMatchObject({ currentState: "INDEPENDENT", propose: "TRANSFERABLE" });
      expect((await proposals(k)).map((p) => p.to_state)).toEqual(["INDEPENDENT", "TRANSFERABLE"]);
      // inputs: the id of the tick that counts (null once unticked, a new id once ticked again)
      const markId = async () => ((await inputs([k])).episodes.find((e) => e.episode_id === transfer.episodeId) as unknown as { transfer_mark_id: string | null }).transfer_mark_id;
      const first = await markId();
      expect(first).toMatch(/^[0-9a-f-]{36}$/);
      await markT(transfer.episodeId, false);
      expect(await markId()).toBeNull();
      await markT(transfer.episodeId, true);
      expect(await markId()).not.toBe(first);
    });

    it("B2: a level 2 set to 1 by hand stays 1 after the engine settles and after a rebuild; new evidence lets the engine move again", async () => {
      const k = "A-L1-PAST-W";
      await evidence("an", { activityId: await step(w3, 3), daysAgo: 4, scores: { [k]: 3 } });
      await recomputeLearner(store(), s.learners.an, [k]);
      expect(await stateOf(k)).toMatchObject({ state: "DEVELOPING" });
      const key = (await recomputeLearner(store(), s.learners.an, [k])).results[0]!.evidenceKey;
      await manualAt(k, "SUPPORTED", key);
      const n = await bookCount();
      expect((await recomputeLearner(store(), s.learners.an, [k])).applied).toMatchObject({ auto: 0, proposed: 0 });
      expect(await stateOf(k)).toMatchObject({ state: "SUPPORTED" });
      await rebuildLearner(store(), s.learners.an, s.members.tutorAn);
      expect(await stateOf(k)).toMatchObject({ state: "SUPPORTED" });
      expect(await bookCount()).toBe(n);
      await evidence("an", { activityId: await step(w3, 4), daysAgo: 1, scores: { [k]: 3 } });
      expect((await recomputeLearner(store(), s.learners.an, [k])).applied).toMatchObject({ auto: 1 });
      expect(await stateOf(k)).toMatchObject({ state: "DEVELOPING" });
    });

    it("B2: ⚑ 'Sửa bậc' 3 → 2 does not re-open a proposal for 'Tự làm được' on the same evidence; evidence that counts brings it back", async () => {
      const k = "A-L2-COMPENSATE-S";
      for (const [inst, n, daysAgo, facets] of [[w1, 9, 21, ["checkpoint"]], [w2, 8, 14, []], [w3, 6, 5, []]] as const) {
        await evidence("an", { activityId: await step(inst, n), daysAgo, scores: { [k]: 3 }, facets: [...facets] });
      }
      await recomputeLearner(store(), s.learners.an, [k]);
      await decideRow((await openOf(k, "PROPOSED"))!);
      expect(await stateOf(k)).toMatchObject({ state: "INDEPENDENT" });
      const key = (await recomputeLearner(store(), s.learners.an, [k])).results[0]!.evidenceKey;
      await manualAt(k, "DEVELOPING", key);
      const r = await recomputeLearner(store(), s.learners.an, [k]);
      expect(r.results[0]).toMatchObject({ currentState: "DEVELOPING", evidenceState: "INDEPENDENT", propose: null });
      expect(await stateOf(k)).toEqual({ state: "DEVELOPING", flag: false, proposal: false });
      await evidence("an", { activityId: await step(w3, 7), daysAgo: 1, scores: { [k]: 4 } });
      expect((await recomputeLearner(store(), s.learners.an, [k])).applied.proposed).toBe(1);
    });

    it("B2: the SQL repeats the guard (a caller that forgets it still cannot overturn the tutor); a bad key is refused", async () => {
      const k = "A-L3-CAUSE-S";
      await evidence("an", { activityId: await step(w3, 8), daysAgo: 1, scores: { [k]: 3 } });
      await recomputeLearner(store(), s.learners.an, [k]);
      const key = (await recomputeLearner(store(), s.learners.an, [k])).results[0]!.evidenceKey;
      const cur = (await stateOf(k))!.state;
      const to = cur === "DEVELOPING" ? "SUPPORTED" : "DEVELOPING";
      await manualAt(k, to, key);
      const n = await bookCount();
      const up = row({ target_key: k, auto: "DEVELOPING", evidence_key: key });
      expect(await apply([up])).toMatchObject({ auto: 0, proposed: 0 });
      expect(await apply([{ ...up, evidence_key: K("c") }])).toMatchObject({ auto: cur === "DEVELOPING" ? 1 : 0 });
      expect(await bookCount()).toBe(n + (cur === "DEVELOPING" ? 1 : 0));
      await fail(manualAt(k, to === "SUPPORTED" ? "DEVELOPING" : "SUPPORTED", "nope"), "22023", /bad_evidence_key/);
    });

    it("S3: a proposal key is the evidence the level's conditions use - the SQL refuses a bad one and dedupes by (level, key)", async () => {
      const k = "A-T7-OPINION"; // INDEPENDENT already (section 3)
      expect(await apply([row({ target_key: k, propose: "TRANSFERABLE", evidence_key: K("5"), propose_key: "x" })])).toMatchObject({ proposed: 0 });
      expect(await apply([row({ target_key: k, propose: "TRANSFERABLE", evidence_key: K("5") })])).toMatchObject({ proposed: 1 });
      await answer((await openOf(k, "PROPOSED"))!, "REJECTED", "INDEPENDENT", "INDEPENDENT");
      expect(await apply([row({ target_key: k, propose: "TRANSFERABLE", evidence_key: K("5") })])).toMatchObject({ proposed: 0 });
      expect(await apply([row({ target_key: k, propose: "TRANSFERABLE", evidence_key: K("6") })])).toMatchObject({ proposed: 1 });
    });

    it("N5: the AUTO row names the route behind the lift (items → 2 for a reading skill, a person's score → 1)", async () => {
      const route = (k: string) => q1<{ route: number | null }>("select route from english.mastery_decisions where learner_id = $1 and target_key = $2 and kind = 'AUTO' order by seq limit 1", [s.learners.an, k]);
      expect(await route("A-T1-TEXT-R")).toEqual([{ route: 2 }]);
      expect(await route("A-L1-PAST-W")).toEqual([{ route: 1 }]);
    });

    it("S2: the engine inputs carry when each decision was validated", async () => {
      const r = await inputs([SKILL]);
      const stamps = r.episodes.flatMap((e) => e.scores).map((x) => (x as unknown as { decided_at?: string }).decided_at);
      expect(stamps.length).toBeGreaterThan(0);
      expect(stamps.every((t) => typeof t === "string" && !Number.isNaN(Date.parse(t)))).toBe(true);
    });

    it("N2: a computation that read older evidence never overwrites the conditions of a newer one", async () => {
      const k = "B-T7-ARGUE";
      const rowN = (conditions: unknown, at: string) => apply([row({ target_key: k, conditions, computed_at: at })], s.learners.nguyen);
      const cond = (have: number) => [{ id: "l1_evidence", level: 1, route: 1, have, need: 1, met: have >= 1, evidence: [] }];
      const stored = async () => (await q1<{ conditions: unknown }>("select conditions from english.competency_state where learner_id = $1 and target_key = $2", [s.learners.nguyen, k]))[0]!.conditions;
      await rowN(cond(2), "2026-10-23T10:00:00.000Z");
      await rowN(cond(1), "2026-10-23T09:00:00.000Z"); // slower, older read
      expect(await stored()).toEqual(cond(2));
      await rowN(cond(3), "2026-10-23T10:00:00.000Z"); // equal → newer or equal wins
      expect(await stored()).toEqual(cond(3));
      await rowN(cond(4), "2026-10-23T11:00:00.000Z");
      expect(await stored()).toEqual(cond(4));
    });
  });

  describe("6. N7: 0023 without 0022 stops with a message that says what to do", () => {
    it("applying 0023 on a database that has no AP-0.3 raises a Vietnamese message naming 0022", async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "mig-"));
      const other = await createTestDb();
      try {
        for (const m of await listMigrations()) {
          if (m.version !== "0022" && Number(m.version) <= 23) await copyFile(m.file, path.join(dir, m.name));
        }
        const err = await applyMigrations(other.client, { dir }).then(() => null, (e: unknown) => e as { message?: string; cause?: { code?: string } });
        expect(err?.cause?.code).toBe("P0001");
        expect(err?.message).toMatch(/0023_skill_states\.sql failed/);
        expect(err?.message).toMatch(/0022/);
        expect(err?.message).toMatch(/AP-0\.3/);
        expect(err?.message).toMatch(/hãy áp/);
      } finally {
        await other.drop();
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

});
