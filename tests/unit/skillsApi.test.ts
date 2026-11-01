import { describe, expect, it, vi } from "vitest";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import { tutorWorkErrors } from "@/lib/copy/vi";
import { evidenceKeyOf } from "@/lib/engine/key";
import type { EngineStore } from "@/lib/engine/runner";
import { handleDecisions, handleModify, handleSupport, ReviewDbError, type ReviewStore } from "@/lib/review/handlers";
import { handleFinishRevision, type RevisionStore } from "@/lib/revision/handlers";
import { confirmAllBodySchema, decideBodySchema, manualBodySchema } from "@/lib/skills/schemas";
import { handleConfirmAll, handleDecideSkill, handleManualSkill, handleRebuild, handleSkillInbox, handleSkillStates, type SkillDeps, type SkillStore } from "@/lib/skills/handlers";
import { parseSkillInbox, parseSkillStates } from "@/lib/skills/shape";
import { failText } from "@/lib/tutorwork/client";
import { AP03 } from "./fixtures/engine";
import { handleSubmit, type WorkStore } from "@/lib/work/handlers";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const DECISION = "d0000000-0000-4000-8000-000000000001";
const P1 = "d0000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-10-23T08:00:00Z");
const mk = (id: string, role: Member["role"]): Member => ({ id: `m-${id}`, userId: `u-${id}`, familyId: FAMILY, role, displayName: id });
const members = [mk("parent", "parent"), mk("tutorAn", "tutor"), mk("tutorNguyen", "tutor"), mk("studentAn", "student")];
const learners: Learner[] = [
  { id: AN, familyId: FAMILY, memberId: "m-studentAn", alias: "An", trackId: "A", isTest: true, status: "active" },
  { id: NGUYEN, familyId: FAMILY, memberId: null, alias: "Nguyên", trackId: "B", isTest: true, status: "active" },
];
const rels: Relationship[] = [
  { memberId: "m-tutorAn", learnerId: AN, relation: "tutor", validFrom: new Date("2026-01-01"), validTo: null },
  { memberId: "m-tutorNguyen", learnerId: NGUYEN, relation: "tutor", validFrom: new Date("2026-01-01"), validTo: null },
];
const access: AccessStore = {
  getMemberByUserId: async (u) => members.find((m) => m.userId === u) ?? null,
  getLearner: async (id) => learners.find((l) => l.id === id) ?? null,
  getRelationships: async (m, l) => rels.filter((r) => r.memberId === m && r.learnerId === l),
};
const accessDeps = { store: access, allowRealLearners: false, now: NOW };
const STATES = {
  policy_version: "AP-0.3", set_id: "A-v1",
  rows: [{
    target_key: "A-L3-CAUSE-W", title_vi: "Viết nguyên nhân – kết quả", domain_key: "writing", state: "DEVELOPING", state_kind: "AUTO",
    state_since: "2026-10-20T12:00:00+07:00", flag: null, proposal: { id: P1, to_state: "INDEPENDENT", route: 1, at: "2026-10-20T12:00:00+07:00" },
    conditions: [{ id: "r1_first_attempts", level: 3, route: 1, have: 3, need: 3, met: true, evidence: [] }], route: 1, evaluated_at: null, updated_at: null,
  }],
};
const INBOX = {
  open: 1, decidable: 1,
  items: [{
    id: P1, kind: "PROPOSED", learner_id: AN, alias: "An", is_test: true, target_key: "A-L3-CAUSE-W", title_vi: "x", from_state: "DEVELOPING", to_state: "INDEPENDENT",
    current_state: "DEVELOPING", route: 1, conditions: [], evidence: [{ episode_id: "e1", title_vi: "Núi lửa", step_no: 11, at: "2026-10-03T12:00:00+07:00" }],
    created_at: "2026-10-20T12:00:00+07:00", can_decide: true,
  }],
};
const skillStore = (over: Partial<SkillStore> = {}) =>
  ({
    getDecisionLearnerId: vi.fn(async (id: string) => (id === DECISION || id === P1 ? AN : null)),
    states: vi.fn(async (): Promise<unknown> => STATES),
    inbox: vi.fn(async (): Promise<unknown> => INBOX),
    decide: vi.fn(async (): Promise<unknown> => ({ id: "c1", target_key: "A-L3-CAUSE-W", replayed: false })),
    confirmAll: vi.fn(async (): Promise<unknown> => ({ ids: ["c1", "c2"], replayed: false })),
    setManual: vi.fn(async (): Promise<unknown> => ({ id: "m1", replayed: false })),
    ...over,
  }) satisfies SkillStore;
const engine = (over: Partial<EngineStore> = {}) =>
  ({
    loadInputs: vi.fn(async (): Promise<unknown> => ({ learner_id: AN, now: "2026-10-23T12:00:00+07:00", policy: null, targets: [], episodes: [], auto: [], exposures: [], decisions: [] })),
    applyResults: vi.fn(async (): Promise<unknown> => ({ auto: 0, proposed: 0, flagged: 0, policy_version: "AP-0.3" })),
    resetStates: vi.fn(async (): Promise<unknown> => ({ targets: 12 })),
    ...over,
  }) satisfies EngineStore;
const deps = (user: string | null, store: SkillStore = skillStore(), eng: EngineStore = engine()): SkillDeps => ({
  user: user ? { id: `u-${user}` } : null, store, engine: eng, access: accessDeps, log: vi.fn(async () => {}),
});
const decide = { client_id: "decide-0001", action: "confirm" };
const reject = { client_id: "decide-0002", action: "reject", reason: "Bài thứ ba còn dựa vào câu mẫu" };

describe("request bodies", () => {
  it("decide: confirm needs nothing more, 'Chưa' needs a reason of 3+ characters; manual only to 1–2 with a reason; confirm-all 1..50 different ids", () => {
    expect(decideBodySchema.safeParse(decide).success).toBe(true);
    expect(decideBodySchema.safeParse(reject).success).toBe(true);
    expect(decideBodySchema.safeParse({ ...reject, reason: " x " }).success).toBe(false);
    expect(decideBodySchema.safeParse({ ...decide, action: "maybe" }).success).toBe(false);
    expect(decideBodySchema.safeParse({ ...decide, score: 3 }).success).toBe(false);
    expect(manualBodySchema.safeParse({ client_id: "manual-0001", target_key: "A-L3-CAUSE-W", state: "DEVELOPING", reason: "Cần câu mẫu" }).success).toBe(true);
    expect(manualBodySchema.safeParse({ client_id: "manual-0001", target_key: "A-L3-CAUSE-W", state: "INDEPENDENT", reason: "Cần câu mẫu" }).success).toBe(false);
    expect(manualBodySchema.safeParse({ client_id: "manual-0001", target_key: "a-l3", state: "DEVELOPING", reason: "Cần câu mẫu" }).success).toBe(false);
    expect(confirmAllBodySchema.safeParse({ client_id: "all-00001", ids: [P1, DECISION] }).success).toBe(true);
    expect(confirmAllBodySchema.safeParse({ client_id: "all-00001", ids: [P1, P1] }).success).toBe(false);
    expect(confirmAllBodySchema.safeParse({ client_id: "all-00001", ids: [] }).success).toBe(false);
  });
});

describe("skill handlers: requireAccess first, then the body, then the store; the SQL checks the actor again", () => {
  it("GET states / inbox: tutor and parent read; the student is 403; outsiders 404; the inbox needs staff", async () => {
    expect((await handleSkillStates(deps("tutorAn"), AN)).status).toBe(200);
    expect((await handleSkillStates(deps("parent"), AN)).body).toEqual({ skills: parseSkillStates(STATES) });
    expect((await handleSkillStates(deps("studentAn"), AN)).status).toBe(403);
    expect((await handleSkillStates(deps("tutorNguyen"), AN)).status).toBe(404);
    const s = skillStore();
    expect((await handleSkillInbox(deps("parent", s))).body).toEqual({ inbox: parseSkillInbox(INBOX) });
    expect(s.inbox).toHaveBeenCalledWith({ byMemberId: "m-parent", allowReal: false });
    expect((await handleSkillInbox(deps("studentAn"))).status).toBe(403);
    expect((await handleSkillInbox(deps(null))).status).toBe(401);
  });

  it("decide: only the child's tutor (parent 403 before the store); unknown or foreign proposal 404; after a new answer the skill is recomputed", async () => {
    const s = skillStore();
    const e = engine();
    expect((await handleDecideSkill(deps("parent", s, e), P1, decide)).status).toBe(403);
    expect((await handleDecideSkill(deps("tutorNguyen", s, e), P1, decide)).status).toBe(404);
    expect((await handleDecideSkill(deps("tutorAn", s, e), "d0000000-0000-4000-8000-0000000000ff", decide)).status).toBe(404);
    expect((await handleDecideSkill(deps("tutorAn", s, e), "not-a-uuid", decide)).status).toBe(404);
    expect(s.decide).not.toHaveBeenCalled();
    expect((await handleDecideSkill(deps("tutorAn", s, e), P1, { ...reject, reason: "" })).status).toBe(400);
    const ok = await handleDecideSkill(deps("tutorAn", s, e), P1, reject);
    expect(ok).toEqual({ status: 201, body: { id: "c1", replayed: false } });
    expect(s.decide).toHaveBeenCalledWith({ decisionId: P1, action: "reject", reason: "Bài thứ ba còn dựa vào câu mẫu", byMemberId: "m-tutorAn", clientId: "decide-0002" });
    expect(e.loadInputs).toHaveBeenCalledWith(AN, ["A-L3-CAUSE-W"]);
  });

  it("database refusals become words the screen can show", async () => {
    const refuse = (code: string, tag: string) => skillStore({ decide: vi.fn(async () => { throw new ReviewDbError(code, `eng_decide_skill: x (${tag})`); }) });
    const cases: [string, string, number, string][] = [
      ["42501", "tutor_only", 403, "skill_tutor_only"],
      ["23505", "already_answered", 409, "already_answered"],
      ["23514", "stale_proposal", 409, "stale_proposal"],
      ["22023", "flag_keep_or_edit", 400, "flag_keep_or_edit"],
      ["23514", "reason_required", 400, "skill_reason_required"],
    ];
    for (const [code, tag, status, error] of cases) {
      const r = await handleDecideSkill(deps("tutorAn", refuse(code, tag)), P1, decide);
      expect([r.status, (r.body as { error: string }).error], tag).toEqual([status, error]);
      expect(failText({ ok: false, status, error })).not.toBe(tutorWorkErrors.generic);
    }
  });

  it("confirm-all and manual: tutor only; a replay does not recompute; manual refuses levels 3–4 in the body", async () => {
    const e = engine();
    expect((await handleConfirmAll(deps("parent", skillStore(), e), AN, { client_id: "all-00001", ids: [P1] })).status).toBe(403);
    const replay = skillStore({ confirmAll: vi.fn(async (): Promise<unknown> => ({ ids: ["c1"], replayed: true })) });
    expect((await handleConfirmAll(deps("tutorAn", replay, e), AN, { client_id: "all-00001", ids: [P1] })).status).toBe(200);
    expect(e.loadInputs).not.toHaveBeenCalled();
    expect((await handleConfirmAll(deps("tutorAn", skillStore(), e), AN, { client_id: "all-00001", ids: [P1] })).status).toBe(201);
    expect(e.loadInputs).toHaveBeenCalledWith(AN, null);
    expect((await handleManualSkill(deps("tutorAn"), AN, { client_id: "manual-0001", target_key: "A-L3-CAUSE-W", state: "INDEPENDENT", reason: "x y z" })).status).toBe(400);
    expect((await handleManualSkill(deps("tutorAn"), AN, { client_id: "manual-0001", target_key: "A-L3-CAUSE-W", state: "SUPPORTED", reason: "Cần câu mẫu" })).status).toBe(201);
  });

  it("B2: a level set by hand is stored with the evidence key the engine saw (null when the engine cannot tell); a failing engine never blocks it", async () => {
    const withPolicy = () => engine({ loadInputs: vi.fn(async (): Promise<unknown> => ({
      learner_id: AN, now: "2026-10-23T12:00:00+07:00", policy: { version: "AP-0.3", config: AP03.config }, targets: [{ key: "A-L3-CAUSE-W", domain: "writing" }],
      episodes: [], auto: [], exposures: [], decisions: [],
    })) });
    const body = { client_id: "manual-0002", target_key: "A-L3-CAUSE-W", state: "SUPPORTED", reason: "Cần câu mẫu" };
    const s1 = skillStore();
    await handleManualSkill(deps("tutorAn", s1, withPolicy()), AN, body);
    expect(s1.setManual).toHaveBeenCalledWith(expect.objectContaining({ evidenceKey: evidenceKeyOf([]) }));
    const s2 = skillStore();
    await handleManualSkill(deps("tutorAn", s2, engine()), AN, body); // no policy: not computable
    expect(s2.setManual).toHaveBeenCalledWith(expect.objectContaining({ evidenceKey: null }));
    const s3 = skillStore();
    const broken = engine({ loadInputs: vi.fn(async () => { throw new Error("boom"); }) });
    const d3 = deps("tutorAn", s3, broken);
    expect((await handleManualSkill(d3, AN, body)).status).toBe(201);
    expect(s3.setManual).toHaveBeenCalledWith(expect.objectContaining({ evidenceKey: null }));
    expect(d3.log).toHaveBeenCalled();
  });

  it("rebuild: tutor and parent; it resets, recomputes every skill and reports what was written", async () => {
    const e = engine();
    const r = await handleRebuild(deps("parent", skillStore(), e), AN);
    expect(r).toEqual({ status: 200, body: { targets: 0, auto: 0, proposed: 0, flagged: 0 } });
    expect(e.resetStates).toHaveBeenCalledWith(AN, "m-parent");
    expect((await handleRebuild(deps("studentAn"), AN)).status).toBe(403);
  });
});

describe("the engine runs after every write that changes evidence (D16), never after a replay or a refusal", () => {
  const hook = () => vi.fn(async () => {});
  const reviewStore = (over: Partial<ReviewStore> = {}) =>
    ({
      getEpisodeLearnerId: vi.fn(async () => AN), getDecisionLearnerId: vi.fn(async () => AN), getAttemptLearnerId: vi.fn(async () => AN), getActivityLearnerId: vi.fn(async () => AN),
      recordReviews: vi.fn(async (): Promise<unknown> => [{ target_key: "A-L3-CAUSE-W", decision_id: "v1", observation_id: "o1", replayed: false }]),
      modifyDecision: vi.fn(async (): Promise<unknown> => ({ decision_id: "v2", replayed: false })),
      recordSupport: vi.fn(async (): Promise<unknown> => ({ id: 1, replayed: false })),
      ...over,
    }) as unknown as ReviewStore;
  const E = "e0000000-0000-4000-8000-000000000001";

  it("S5 decisions, corrections and observed help call the hook with the child and the skills; a replay does not", async () => {
    const h = hook();
    const d = { user: { id: "u-tutorAn" }, store: reviewStore(), access: accessDeps, afterWrite: h };
    await handleDecisions(d, E, { client_id: "review-0001", items: [{ target_id: "A-L3-CAUSE-W", score: 3, not_observed: false }] });
    expect(h).toHaveBeenLastCalledWith(AN, ["A-L3-CAUSE-W"]);
    await handleModify(d, E, { client_id: "modify-0001", score: 2, not_observed: false, reason: "Đọc lại thấy thiếu" });
    expect(h).toHaveBeenLastCalledWith(AN, null);
    await handleSupport(d, E, { client_id: "support-0001", target_ids: ["A-L3-CAUSE-W"], kind: "frame" });
    expect(h).toHaveBeenLastCalledWith(AN, ["A-L3-CAUSE-W"]);
    expect(h).toHaveBeenCalledTimes(3);
    const replayed = { ...d, store: reviewStore({ recordReviews: vi.fn(async (): Promise<unknown> => [{ target_key: "A-L3-CAUSE-W", decision_id: "v1", observation_id: "o1", replayed: true }]) }) };
    await handleDecisions(replayed, E, { client_id: "review-0001", items: [{ target_id: "A-L3-CAUSE-W", score: 3, not_observed: false }] });
    expect(h).toHaveBeenCalledTimes(3);
  });

  it("a student's submission and the reviewer's 'Xong' call it too", async () => {
    const h = hook();
    const work = {
      getActivityLearnerId: vi.fn(async () => AN),
      submit: vi.fn(async (): Promise<unknown> => ({ attempt_id: "t1", attempt_no: 1, submitted_at: "2026-10-23T08:00:00Z", hash: "e".repeat(64), replayed: false })),
    } as unknown as WorkStore;
    await handleSubmit({ user: { id: "u-studentAn" }, store: work, access: accessDeps, afterWrite: h }, { activity_id: E, client_submission_id: E, content: { text: "Volcanoes erupt because the gas is trapped." }, assistance: ["none"], provenance: "in_app" });
    expect(h).toHaveBeenCalledWith(AN, null);
    const rev = {
      getAttemptLearnerId: vi.fn(async () => AN),
      finishRevision: vi.fn(async (): Promise<unknown> => ({ closing_id: "c1", feedback_id: null, revision_activity_id: null, replayed: false })),
    } as unknown as RevisionStore;
    await handleFinishRevision({ user: { id: "u-tutorAn" }, store: rev, access: accessDeps, afterWrite: h }, E, { client_id: "finish-0001", action: "close", checks: [{ n: 1, verdict: "improved" }] });
    expect(h).toHaveBeenCalledTimes(2);
  });
});
