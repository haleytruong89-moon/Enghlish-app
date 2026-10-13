import { describe, expect, it, vi } from "vitest";
import type { AccessStore, Learner, Member, Relationship, Role } from "@/lib/auth/requireAccess";
import {
  handleSaveDraft,
  handleStudentActivity,
  handleStudentHome,
  handleSubmit,
  WorkDbError,
  type HandlerDeps,
  type WorkStore,
} from "@/lib/work/handlers";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const ACT_AN = "11111111-1111-4111-8111-111111111111";
const ACT_NGUYEN = "22222222-2222-4222-8222-222222222222";
const CLIENT_ID = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-10-14T08:00:00Z");

const mk = (id: string, role: Member["role"]): Member => ({ id: `m-${id}`, userId: `u-${id}`, familyId: FAMILY, role, displayName: id });
const members = [mk("parent", "parent"), mk("tutorAn", "tutor"), mk("studentAn", "student"), mk("studentNguyen", "student"), mk("stranger", "student")];
const learners: Learner[] = [
  { id: AN, familyId: FAMILY, memberId: "m-studentAn", alias: "An", trackId: "A", isTest: true, status: "active" },
  { id: NGUYEN, familyId: FAMILY, memberId: "m-studentNguyen", alias: "Nguyên", trackId: "B", isTest: true, status: "active" },
];
const rels: Relationship[] = [{ memberId: "m-tutorAn", learnerId: AN, relation: "tutor", validFrom: new Date("2026-01-01"), validTo: null }];
const access: AccessStore = {
  getMemberByUserId: async (u) => members.find((m) => m.userId === u) ?? null,
  getLearner: async (id) => learners.find((l) => l.id === id) ?? null,
  getRelationships: async (m, l) => rels.filter((r) => r.memberId === m && r.learnerId === l),
};

const rpcActivity = {
  activity_id: ACT_AN,
  instance_id: "44444444-4444-4444-8444-444444444444",
  step_no: 2,
  activity_type: "ACT-SOURCE-QA",
  mode: "PRACTICE",
  purpose: ["delayed_check"],
  date: "2026-10-14",
  title_vi: "Núi lửa",
  big_question_en: "Why do volcanoes erupt?",
  big_question_vi: "Vì sao núi lửa phun?",
  shape: "answers",
  supported: true,
  can_submit: true,
  step: { prompt_en: "Read and answer.", time_min: 15, self_check_vi: ["Đọc lại câu hỏi"], items: [{ id: "q1", kind: "mcq", stem: "Magma is…", options: ["hot", "cold"] }] },
  attempts: [],
  draft: null,
};
const rpcSources = [{ id: "S1", title: "Volcanoes", author: "X", rights_note: "ok", modality: "text", url: null, text: "Magma rises." }];
const rpcReceipt = { attempt_id: "55555555-5555-4555-8555-555555555555", attempt_no: 1, submitted_at: "2026-10-14T08:00:00Z", hash: "abc", replayed: false };

function makeStore(over: Partial<WorkStore> = {}) {
  const profiles: Record<string, { role: Role; learnerId: string | null }> = {
    "u-studentAn": { role: "student", learnerId: AN },
    "u-studentNguyen": { role: "student", learnerId: NGUYEN },
    "u-stranger": { role: "student", learnerId: null },
    "u-tutorAn": { role: "tutor", learnerId: null },
    "u-parent": { role: "parent", learnerId: null },
  };
  return {
    getOwnProfile: vi.fn(async (u: string) => profiles[u] ?? null),
    getActivityLearnerId: vi.fn(async (id: string) => (id === ACT_AN ? AN : id === ACT_NGUYEN ? NGUYEN : null)),
    getHome: vi.fn(async () => ({ inquiries: [] })),
    getActivity: vi.fn(async (): Promise<unknown> => rpcActivity),
    getSources: vi.fn(async (): Promise<unknown> => rpcSources),
    saveDraft: vi.fn(async () => ({ revision: 3, saved_at: "2026-10-14T08:00:00Z", other_tab_changed: false })),
    submit: vi.fn(async (): Promise<unknown> => rpcReceipt),
    ...over,
  } satisfies WorkStore;
}

const deps = (user: string | null, store: WorkStore): HandlerDeps => ({
  user: user ? { id: `u-${user}` } : null,
  store,
  access: { store: access, allowRealLearners: false, now: NOW },
});

const goodAttempt = {
  activity_id: ACT_AN,
  client_submission_id: CLIENT_ID,
  content: { answers: { q1: "hot" } },
  assistance: ["none"],
  provenance: "in_app",
};

describe("S4 route handlers: access", () => {
  it("401 without a session on every handler, nothing is touched", async () => {
    const s = makeStore();
    expect((await handleStudentHome(deps(null, s))).status).toBe(401);
    expect((await handleStudentActivity(deps(null, s), ACT_AN)).status).toBe(401);
    expect((await handleSaveDraft(deps(null, s), ACT_AN, { content: {} })).status).toBe(401);
    expect((await handleSubmit(deps(null, s), goodAttempt)).status).toBe(401);
    expect(s.getHome).not.toHaveBeenCalled();
    expect(s.getActivity).not.toHaveBeenCalled();
    expect(s.saveDraft).not.toHaveBeenCalled();
    expect(s.submit).not.toHaveBeenCalled();
  });

  it("staff in scope get 403 and cannot submit or save (parent, tutor); nothing is written", async () => {
    const s = makeStore();
    for (const who of ["parent", "tutorAn"]) {
      expect((await handleStudentHome(deps(who, s))).status, who).toBe(403);
      expect((await handleStudentActivity(deps(who, s), ACT_AN)).status, who).toBe(403);
      expect((await handleSaveDraft(deps(who, s), ACT_AN, { content: { text: "x" } })).status, who).toBe(403);
      expect((await handleSubmit(deps(who, s), goodAttempt)).status, who).toBe(403);
    }
    expect(s.getActivity).not.toHaveBeenCalled();
    expect(s.saveDraft).not.toHaveBeenCalled();
    expect(s.submit).not.toHaveBeenCalled();
  });

  it("404 for another child's activity, a tutor outside scope, unknown ids, a malformed id", async () => {
    const s = makeStore();
    expect((await handleStudentActivity(deps("studentNguyen", s), ACT_AN)).status).toBe(404);
    expect((await handleSaveDraft(deps("studentNguyen", s), ACT_AN, { content: { text: "x" } })).status).toBe(404);
    expect((await handleSubmit(deps("studentNguyen", s), goodAttempt)).status).toBe(404);
    expect((await handleStudentActivity(deps("studentAn", s), "99999999-9999-4999-8999-999999999999")).status).toBe(404);
    expect((await handleStudentActivity(deps("studentAn", s), "not-a-uuid")).status).toBe(404);
    expect((await handleStudentHome(deps("stranger", s))).status).toBe(404); // a student account without a learner
    expect((await handleStudentActivity(deps("tutorAn", s), ACT_NGUYEN)).status).toBe(404);
    expect(s.getActivity).not.toHaveBeenCalled();
    expect(s.submit).not.toHaveBeenCalled();
  });

  it("a real learner is invisible while ALLOW_REAL_LEARNERS is off", async () => {
    const s = makeStore();
    const real = { ...learners[0]!, isTest: false };
    const d: HandlerDeps = {
      ...deps("studentAn", s),
      access: { store: { ...access, getLearner: async () => real }, allowRealLearners: false, now: NOW },
    };
    expect((await handleStudentActivity(d, ACT_AN)).status).toBe(404);
    expect((await handleStudentHome(d)).status).toBe(404);
  });

  it("a signed-in user that is not a member gets 404", async () => {
    const s = makeStore();
    expect((await handleStudentHome({ ...deps("studentAn", s), user: { id: "u-nobody" } })).status).toBe(404);
  });
});

describe("S4 route handlers: reads", () => {
  it("home returns the greeting alias and released steps only in the allowed shape", async () => {
    const s = makeStore({
      getHome: vi.fn(async () => ({
        inquiries: [
          {
            instance_id: "i1",
            title_vi: "Núi lửa",
            big_question_en: "Why?",
            big_question_vi: "Vì sao?",
            due_on: "2026-10-20",
            steps: [{ activity_id: ACT_AN, step_no: 2, activity_type: "ACT-SOURCE-QA", mode: "PRACTICE", purpose: ["baseline", "checkpoint", "delayed_check"], time_min: 15, date: "2026-10-14", attempts: 0, target_ids: ["T1"], auto_check: { x: 1 } }],
          },
        ],
      })),
    });
    const r = await handleStudentHome(deps("studentAn", s));
    expect(r.status).toBe(200);
    const text = JSON.stringify(r.body);
    // unknown keys are stripped, and only the two "other child can see" purposes survive
    for (const bad of ["target_ids", "auto_check", "baseline", "checkpoint", "T1"]) expect(text).not.toContain(bad);
    expect(r.body).toMatchObject({ learner: { alias: "An" }, inquiries: [{ steps: [{ activityId: ACT_AN, purpose: ["delayed_check"] }] }] });
  });

  it("activity: questions + sources + draft, without keys, results, transcripts or notes", async () => {
    const s = makeStore({
      getActivity: vi.fn(async () => ({
        ...rpcActivity,
        answer: "A",
        auto_checks: { q1: "correct" },
        step: { ...rpcActivity.step, items: [{ id: "q1", kind: "mcq", stem: "x", options: ["a", "b"], answer: "a", explanation_vi: "vì…" }], prompt_vi: "bí mật" },
        draft: { content: { answers: { q1: "a" } }, revision: 2, updated_at: "2026-10-14T07:00:00Z" },
      })),
      getSources: vi.fn(async () => [{ ...rpcSources[0], transcript: "secret", review_note: "n" }, { id: "S2", title: "Talk", modality: "audio", url: "https://example.org/a", text: "SHOULD NOT SHOW" }]),
    });
    const r = await handleStudentActivity(deps("studentAn", s), ACT_AN);
    expect(r.status).toBe(200);
    const text = JSON.stringify(r.body);
    for (const bad of ["auto_check", "explanation", "prompt_vi", "transcript", "review_note", "secret", "SHOULD NOT SHOW", '"answer"', "correct"]) {
      expect(text, bad).not.toContain(bad);
    }
    expect(r.body).toMatchObject({
      activity: {
        activityId: ACT_AN,
        canSubmit: true,
        step: { items: [{ id: "q1", options: ["a", "b"] }] },
        draft: { revision: 2, content: { answers: { q1: "a" } } },
        sources: [{ id: "S1", text: "Magma rises." }, { id: "S2", modality: "audio", text: null }],
      },
    });
  });

  it("a step the app cannot do yet: only the neutral status goes out, sources are not even requested, extra keys are stripped", async () => {
    const s = makeStore({
      getActivity: vi.fn(async () => ({
        supported: false,
        activity_id: ACT_AN,
        instance_id: "44444444-4444-4444-8444-444444444444",
        step_no: 1,
        activity_type: "ACT-SPEAK-LIVE",
        mode: "INDEPENDENT_CHECK",
        date: "2026-10-14",
        title_vi: "Núi lửa",
        status_label_key: "with_tutor",
        // things that must never come through even if the database sent them
        big_question_en: "Why do volcanoes erupt?",
        step: { prompt_en: "SECRET PROMPT", items: [{ id: "q1", kind: "mcq", stem: "SECRET STEM", options: ["a"] }], self_check_vi: ["SECRET CHECK"] },
        sources: rpcSources,
        purpose: ["baseline"],
        attempts: [{ attempt_no: 1 }],
      })),
    });
    const r = await handleStudentActivity(deps("studentAn", s), ACT_AN);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      activity: {
        supported: false,
        activityId: ACT_AN,
        instanceId: "44444444-4444-4444-8444-444444444444",
        stepNo: 1,
        activityType: "ACT-SPEAK-LIVE",
        mode: "INDEPENDENT_CHECK",
        date: "2026-10-14",
        titleVi: "Núi lửa",
        statusLabelKey: "with_tutor",
      },
    });
    expect(JSON.stringify(r.body)).not.toMatch(/SECRET|Magma|baseline|Why do/);
    expect(s.getSources).not.toHaveBeenCalled();
  });

  it("an unknown status label key is an error, never a guess", async () => {
    const bad = { supported: false, activity_id: ACT_AN, instance_id: "i", step_no: 1, activity_type: "ACT-SPEAK-LIVE", mode: "PRACTICE", date: "2026-10-14", title_vi: "x", status_label_key: "secret" };
    await expect(handleStudentActivity(deps("studentAn", makeStore({ getActivity: vi.fn(async () => bad) })), ACT_AN)).rejects.toThrow();
  });

  it("an unreleased step looks exactly like a missing one (404)", async () => {
    const s = makeStore({ getActivity: vi.fn(async () => null) });
    expect((await handleStudentActivity(deps("studentAn", s), ACT_AN)).status).toBe(404);
    expect(s.getSources).not.toHaveBeenCalled();
  });

  it("a shape the database did not promise is an error (500 upstream), never a partial answer", async () => {
    const s = makeStore({ getActivity: vi.fn(async () => ({ ...rpcActivity, mode: "WEIRD" })) });
    await expect(handleStudentActivity(deps("studentAn", s), ACT_AN)).rejects.toThrow();
  });
});

describe("S4 route handlers: drafts", () => {
  it("saves a draft, passes the base revision through and returns camelCase", async () => {
    const s = makeStore();
    const r = await handleSaveDraft(deps("studentAn", s), ACT_AN, { content: { text: "Hello", pasted: false }, base_revision: 2 });
    expect(r).toEqual({ status: 200, body: { draft: { revision: 3, savedAt: "2026-10-14T08:00:00Z", otherTabChanged: false } } });
    expect(s.saveDraft).toHaveBeenCalledWith({ activityId: ACT_AN, content: { text: "Hello", pasted: false }, baseRevision: 2 });
  });

  it("400 for unknown keys, wrong types, oversize text, bad assistance", async () => {
    const s = makeStore();
    const bad: unknown[] = [
      undefined,
      null,
      {},
      { content: { text: 5 } },
      { content: { text: "x".repeat(20001) } },
      { content: { score: 4 } },
      { content: {}, extra: 1 },
      { content: { assistance: ["magic"] } },
      { content: { answers: { q1: 1 } } },
      { content: {}, base_revision: -1 },
    ];
    for (const b of bad) expect((await handleSaveDraft(deps("studentAn", s), ACT_AN, b)).status, JSON.stringify(b)).toBe(400);
    expect(s.saveDraft).not.toHaveBeenCalled();
  });

  it("maps database errors: 22023 → 400, P0002 → 404, 23505 → 409, 42501 → 403; unknown errors are rethrown", async () => {
    const codes: [string, number][] = [["22023", 400], ["P0002", 404], ["23505", 409], ["42501", 403]];
    for (const [code, status] of codes) {
      const s = makeStore({ saveDraft: vi.fn(async () => { throw new WorkDbError(code, "x"); }) });
      expect((await handleSaveDraft(deps("studentAn", s), ACT_AN, { content: { text: "x" } })).status, code).toBe(status);
    }
    const s = makeStore({ saveDraft: vi.fn(async () => { throw new WorkDbError("XX000", "boom"); }) });
    await expect(handleSaveDraft(deps("studentAn", s), ACT_AN, { content: { text: "x" } })).rejects.toThrow("boom");
  });
});

describe("S4 route handlers: submit", () => {
  it("201 with a receipt for the first submit, 200 when the same submission is replayed", async () => {
    const first = await handleSubmit(deps("studentAn", makeStore()), goodAttempt);
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ receipt: { attemptId: rpcReceipt.attempt_id, attemptNo: 1, submittedAt: rpcReceipt.submitted_at, hash: "abc", replayed: false } });
    const again = await handleSubmit(deps("studentAn", makeStore({ submit: vi.fn(async () => ({ ...rpcReceipt, replayed: true })) })), goodAttempt);
    expect(again.status).toBe(200);
  });

  it("the receipt carries no result of any kind", async () => {
    const s = makeStore({ submit: vi.fn(async () => ({ ...rpcReceipt, checks: { correct: 3 }, score: 4, auto_checks: {} })) });
    const r = await handleSubmit(deps("studentAn", s), goodAttempt);
    expect(Object.keys((r.body as { receipt: object }).receipt).sort()).toEqual(["attemptId", "attemptNo", "hash", "replayed", "submittedAt"]);
  });

  it("passes exactly the validated fields to the database", async () => {
    const s = makeStore();
    await handleSubmit(deps("studentAn", s), { ...goodAttempt, assistance: ["notes", "dictionary"], provenance: "pasted", content: { text: "My paragraph." } });
    expect(s.submit).toHaveBeenCalledWith({
      activityId: ACT_AN,
      clientSubmissionId: CLIENT_ID,
      content: { text: "My paragraph." },
      assistance: ["notes", "dictionary"],
      provenance: "pasted",
    });
  });

  it("400 for a missing declaration, 'none' mixed with others, bad ids, empty or mixed content, extra keys", async () => {
    const s = makeStore();
    const bad: unknown[] = [
      undefined,
      "x",
      {},
      { ...goodAttempt, activity_id: "nope" },
      { ...goodAttempt, client_submission_id: "nope" },
      { ...goodAttempt, assistance: [] },
      { ...goodAttempt, assistance: undefined },
      { ...goodAttempt, assistance: ["none", "notes"] },
      { ...goodAttempt, assistance: ["robot"] },
      { ...goodAttempt, provenance: "typed" },
      { ...goodAttempt, content: { text: "" } },
      { ...goodAttempt, content: { text: "a", answers: { q1: "b" } } },
      { ...goodAttempt, content: {} },
      { ...goodAttempt, extra: true },
    ];
    for (const b of bad) expect((await handleSubmit(deps("studentAn", s), b)).status, JSON.stringify(b)).toBe(400);
    expect(s.submit).not.toHaveBeenCalled();
  });

  it("a body for another child's activity is a 404 before any validation detail leaks", async () => {
    const s = makeStore();
    expect((await handleSubmit(deps("studentNguyen", s), { ...goodAttempt, assistance: [] })).status).toBe(404);
  });

  it("409 when the id is reused for different content or a one-time check is submitted twice; 404 when not released", async () => {
    for (const [code, status] of [["23505", 409], ["P0002", 404], ["22023", 400], ["42501", 403]] as const) {
      const s = makeStore({ submit: vi.fn(async () => { throw new WorkDbError(code, "x"); }) });
      expect((await handleSubmit(deps("studentAn", s), goodAttempt)).status, code).toBe(status);
    }
  });
});
