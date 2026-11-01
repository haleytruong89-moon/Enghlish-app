import { describe, expect, it, vi } from "vitest";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import {
  handleDecisions,
  handleEpisode,
  handleInbox,
  handleListNotes,
  handleModify,
  handleOffline,
  handleMarkTransfer,
  handleSupport,
  handleWriteNote,
  ReviewDbError,
  type HandlerDeps,
  type ReviewStore,
} from "@/lib/review/handlers";
import { SUPPORT_NOTE_MAX } from "@/lib/review/types";
import { decisionsBodySchema, modifyBodySchema, noteBodySchema, offlineBodySchema, supportBodySchema } from "@/lib/review/schemas";
import { parseEpisode, parseInbox, parseNotes } from "@/lib/review/shape";
import { toActivityView } from "@/lib/work/shape";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const EP_AN = "11111111-1111-4111-8111-111111111111";
const EP_NGUYEN = "22222222-2222-4222-8222-222222222222";
const DEC_AN = "33333333-3333-4333-8333-333333333333";
const ATT_AN = "44444444-4444-4444-8444-444444444444";
const ACT_AN = "55555555-5555-4555-8555-555555555555";
const ACT_NGUYEN = "66666666-6666-4666-8666-666666666666";
const NOW = new Date("2026-10-14T08:00:00Z");

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

function makeStore(over: Partial<ReviewStore> = {}) {
  return {
    getEpisodeLearnerId: vi.fn(async (id: string) => (id === EP_AN ? AN : id === EP_NGUYEN ? NGUYEN : null)),
    getDecisionLearnerId: vi.fn(async (id: string) => (id === DEC_AN ? AN : null)),
    getAttemptLearnerId: vi.fn(async (id: string) => (id === ATT_AN ? AN : null)),
    getActivityLearnerId: vi.fn(async (id: string) => (id === ACT_AN ? AN : id === ACT_NGUYEN ? NGUYEN : null)),
    inbox: vi.fn(async (_args: Parameters<ReviewStore["inbox"]>[0]) => ({ items: [], next: null, counts: { todo: 0, tutor: 0, independent: 0, baseline: 0, practice: 0, done: 0, to_decide: 0 } })),
    episode: vi.fn(async () => null),
    listNotes: vi.fn(async () => []),
    recordReviews: vi.fn(async () => [{ target_key: "A-L3-CAUSE-W", observation_id: "o1", decision_id: "d1", replayed: false }]),
    modifyDecision: vi.fn(async () => ({ decision_id: "d2", supersedes_id: DEC_AN, replayed: false })),
    recordSupport: vi.fn(async () => ({ id: "s1", replayed: false })),
    markTransfer: vi.fn(async () => ({ value: true, replayed: false })),
    recordOffline: vi.fn(async () => ({ attempt_id: "at1", episode_id: "ep1", attempt_no: 1, replayed: false })),
    writeNote: vi.fn(async () => ({ id: "n1", replayed: false })),
    ...over,
  } satisfies ReviewStore;
}
const deps = (user: string | null, store: ReviewStore, allowReal = false): HandlerDeps => ({
  user: user ? { id: `u-${user}` } : null,
  store,
  access: { store: access, allowRealLearners: allowReal, now: NOW },
});

const goodDecisions = { client_id: "client-0001", items: [{ target_id: "A-L3-CAUSE-W", score: 3, not_observed: false }] };
const goodModify = { client_id: "client-0002", score: 2, not_observed: false, reason: "Chưa đủ ví dụ" };
const goodSupport = { kind: "frame", target_ids: ["A-L3-CAUSE-W"], note: "Cho câu mẫu" };
const goodOffline = {
  client_id: "77777777-7777-4777-8777-777777777777", activity_id: ACT_AN, provenance: "tutor_live", text: "An nói 5 câu",
  session_date: "2026-10-13", assistance: ["none"],
};
const goodNote = { client_id: "note-00001", session_date: "2026-10-13", support_level: "light", next_actions: ["Kể lại"], published: false };

describe("S5 handlers: 401 / 404 / 403 come before anything else", () => {
  it("401 without a session on every handler, and the store is not touched", async () => {
    const s = makeStore();
    const d = deps(null, s);
    const results = [
      await handleInbox(d), await handleEpisode(d, EP_AN), await handleDecisions(d, EP_AN, goodDecisions),
      await handleModify(d, DEC_AN, goodModify), await handleSupport(d, ATT_AN, goodSupport), await handleOffline(d, AN, goodOffline),
      await handleListNotes(d, AN), await handleWriteNote(d, AN, goodNote),
    ];
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(401));
    for (const fn of [s.inbox, s.episode, s.recordReviews, s.modifyDecision, s.recordSupport, s.recordOffline, s.listNotes, s.writeNote]) expect(fn).not.toHaveBeenCalled();
    expect(s.getEpisodeLearnerId).not.toHaveBeenCalled();
  });

  it("a student gets 403 everywhere (even for their own episode) - and never reaches the store", async () => {
    const s = makeStore();
    const d = deps("studentAn", s);
    expect((await handleInbox(d)).status).toBe(403);
    expect((await handleEpisode(d, EP_AN)).status).toBe(403);
    expect((await handleDecisions(d, EP_AN, goodDecisions)).status).toBe(403);
    expect((await handleModify(d, DEC_AN, goodModify)).status).toBe(403);
    expect((await handleSupport(d, ATT_AN, goodSupport)).status).toBe(403);
    expect((await handleOffline(d, AN, goodOffline)).status).toBe(403);
    expect((await handleListNotes(d, AN)).status).toBe(403);
    expect((await handleWriteNote(d, AN, goodNote)).status).toBe(403);
    for (const fn of [s.inbox, s.episode, s.recordReviews, s.modifyDecision, s.recordSupport, s.recordOffline, s.listNotes, s.writeNote]) expect(fn).not.toHaveBeenCalled();
  });

  it("the other child's tutor and unknown ids get 404 (never 403), and nothing is written", async () => {
    const s = makeStore();
    const d = deps("tutorNguyen", s);
    expect((await handleEpisode(d, EP_AN)).status).toBe(404);
    expect((await handleDecisions(d, EP_AN, goodDecisions)).status).toBe(404);
    expect((await handleModify(d, DEC_AN, goodModify)).status).toBe(404);
    expect((await handleSupport(d, ATT_AN, goodSupport)).status).toBe(404);
    expect((await handleOffline(d, AN, goodOffline)).status).toBe(404);
    expect((await handleListNotes(d, AN)).status).toBe(404);
    expect((await handleWriteNote(d, AN, goodNote)).status).toBe(404);
    expect((await handleEpisode(deps("parent", s), "not-a-uuid")).status).toBe(404);
    expect((await handleEpisode(deps("parent", s), "99999999-9999-4999-8999-999999999999")).status).toBe(404);
    for (const fn of [s.recordReviews, s.modifyDecision, s.recordSupport, s.recordOffline, s.writeNote]) expect(fn).not.toHaveBeenCalled();
  });

  it("a Launcher-only account (no member row) gets 404 on the inbox", async () => {
    const s = makeStore();
    expect((await handleInbox({ user: { id: "u-stranger" }, store: s, access: { store: access, allowRealLearners: false, now: NOW } })).status).toBe(404);
  });

  it("the old note form cannot replace a note written with the session form (v2): 400, nothing written; old notes still can be", async () => {
    const v2 = { id: EP_AN, learner_id: AN, tutor_member_id: "m-tutorAn", session_date: "2026-10-13", goals: "Unit 7", observed: null, support_level: null, next_actions: [], practised_target_ids: [], published: true, supersedes_id: null, created_at: "2026-10-13T01:00:00Z", weak_tag_keys: ["dang-tu"], message_to_learner: "Ôn nhé", note_for_parent: null, author_role: "tutor" };
    const s = makeStore({ listNotes: vi.fn(async () => [v2]) });
    const r = await handleWriteNote(deps("tutorAn", s), AN, { ...goodNote, supersedes_id: EP_AN });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: "note_is_v2" });
    expect(s.writeNote).not.toHaveBeenCalled();
    const old = makeStore({ listNotes: vi.fn(async () => [{ ...v2, support_level: "light", weak_tag_keys: [], message_to_learner: null }]) });
    expect((await handleWriteNote(deps("tutorAn", old), AN, { ...goodNote, supersedes_id: EP_AN })).status).toBe(201);
  });

  it("a parent may not write lesson notes (403), but may read them", async () => {
    const s = makeStore();
    expect((await handleWriteNote(deps("parent", s), AN, goodNote)).status).toBe(403);
    expect((await handleListNotes(deps("parent", s), AN)).status).toBe(200);
    expect(s.writeNote).not.toHaveBeenCalled();
  });

  it("real children are 404 on a preview (ALLOW_REAL_LEARNERS=false)", async () => {
    const s = makeStore({ getEpisodeLearnerId: vi.fn(async () => "c0000000-0000-4000-8000-000000000009") });
    const real: Learner = { id: "c0000000-0000-4000-8000-000000000009", familyId: FAMILY, memberId: null, alias: "Real", trackId: "A", isTest: false, status: "active" };
    const store: AccessStore = { ...access, getLearner: async (id) => (id === real.id ? real : null) };
    const d = (allowReal: boolean): HandlerDeps => ({ user: { id: "u-parent" }, store: s, access: { store, allowRealLearners: allowReal, now: NOW } });
    expect((await handleDecisions(d(false), EP_AN, goodDecisions)).status).toBe(404);
    expect((await handleDecisions(d(true), EP_AN, goodDecisions)).status).toBe(201);
  });
});

describe("S5 handlers: inbox and review view", () => {
  it("the inbox asks the database with the preview flag and returns parsed items", async () => {
    const row = {
      episode_id: EP_AN, attempt_id: ATT_AN, learner_id: AN, alias: "An", is_test: true, title_vi: "Núi lửa", step_no: 6, activity_type: "ACT-WRITE",
      mode: "PRACTICE", purpose: [], provenance: "in_app", attempt_no: 1, is_first_attempt: true, submitted_at: "2026-10-14T01:00:00Z",
      restricted: false, category: "practice", targets_total: 2, targets_decided: 0, can_decide: true, secret: "x",
    };
    const counts = { todo: 1, tutor: 0, independent: 0, baseline: 0, practice: 1, done: 0, to_decide: 1 };
    const s = makeStore({ inbox: vi.fn(async () => ({ items: [row], next: null, counts })) });
    const r = await handleInbox(deps("parent", s));
    expect(r.status).toBe(200);
    expect(s.inbox).toHaveBeenCalledWith({ allowReal: false, filter: "todo", limit: 50, after: null });
    const body = r.body as { items: { episodeId: string }[]; next: unknown; counts: { toDecide: number; todo: number } };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.episodeId).toBe(EP_AN);
    expect(body.counts).toMatchObject({ todo: 1, toDecide: 1 });
    expect(body.next).toBeNull();
    expect(JSON.stringify(body)).not.toContain("secret");
    await handleInbox(deps("parent", s, true));
    expect(s.inbox).toHaveBeenLastCalledWith({ allowReal: true, filter: "todo", limit: 50, after: null });
  });

  it("the inbox passes the filter, the page size and the cursor to the database, and refuses nonsense with 400", async () => {
    const s = makeStore();
    const cursor = { after_at: "2026-10-14T04:35:03.123456+00:00", after_id: "6f1b0c7e-3a54-4a52-9e0e-0d9d5b1b7c11" };
    expect((await handleInbox(deps("tutorAn", s), { filter: "done", limit: "20", ...cursor })).status).toBe(200);
    expect(s.inbox).toHaveBeenLastCalledWith({ allowReal: false, filter: "done", limit: 20, after: { at: cursor.after_at, id: cursor.after_id } });
    vi.mocked(s.inbox).mockClear();
    for (const bad of [{ filter: "everything" }, { limit: "0" }, { limit: "101" }, { limit: "abc" }, { after_at: cursor.after_at }, { after_id: cursor.after_id }, { ...cursor, after_id: "x" }]) {
      expect((await handleInbox(deps("tutorAn", s), bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(s.inbox).not.toHaveBeenCalled();
  });

  it("the review view is 404 when the database says null (not staff of the child)", async () => {
    expect((await handleEpisode(deps("tutorAn", makeStore()), EP_AN)).status).toBe(404);
  });

  it("parseEpisode keeps the current decision and the history, and drops unknown fields", () => {
    const raw = {
      episode: { id: EP_AN, is_first_attempt: true, observed_directly: false, facets: { checkpoint: true }, restricted: true },
      learner: { id: AN, alias: "An", track_id: "A", is_test: true },
      viewer: { role: "parent", can_decide: false, restricted: true },
      attempt: { id: ATT_AN, attempt_no: 1, mode: "INDEPENDENT_CHECK", provenance: "in_app", submitted_at: "t", declared_assistance: ["none"], recorded_by_name: null },
      artifact: { kind: "text", content: { text: "hello" } },
      activity: { id: ACT_AN, step_no: 11, activity_type: "ACT-WRITE", mode: "INDEPENDENT_CHECK", purpose: ["checkpoint"], time_min: 20 },
      inquiry: { id: "i", title_vi: "Núi lửa", big_question_en: null, big_question_vi: null },
      step: { prompt_en: "Write", items: [] },
      sources: [], auto_checks: null, keys: [], assistance: [],
      targets: [{
        key: "A-L3-CAUSE-W", is_target: true, scorable: true, locked_reason: null, title_vi: "Viết", dimension: { name_vi: "Tổ chức", rubric_vi: { "3": "Tốt" } },
        criteria: [{ id: "c1", check_vi: "x", method: "rater", computable: false }], opportunity_rule: null,
        decisions: [
          { id: "d1", decision: "AGREE", final_score: 4, final_not_observed: false, validator_role: "tutor", validator_name: "Cô", reason: null, supersedes_id: null, at: "t1", current: false },
          { id: "d2", decision: "MODIFY", final_score: null, final_not_observed: true, validator_role: "tutor", validator_name: "Cô", reason: "Xem lại", supersedes_id: "d1", at: "t2", current: true },
        ],
      }],
      tech: { template_id: "A-W1", template_version: 1, catalogue_version: "0.2.1-draft", descriptor_version: "A-v1", policy_version: "AP", extra: 1 },
      hidden: "x",
    };
    const v = parseEpisode(raw);
    expect(v.targets[0]?.current).toMatchObject({ id: "d2", finalScore: null, finalNotObserved: true });
    expect(v.targets[0]?.decisions.map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(JSON.stringify(v)).not.toContain("hidden");
    expect(v.viewer).toEqual({ role: "parent", canDecide: false, restricted: true });
    expect(() => parseEpisode({ ...raw, targets: [{ ...raw.targets[0], decisions: [{ ...raw.targets[0]!.decisions[0], final_score: 7 }] }] })).toThrow();
  });

  it("parseInbox / parseNotes tolerate empty and compute 'current' for notes", () => {
    expect(parseInbox(null)).toMatchObject({ items: [], next: null, counts: { todo: 0, toDecide: 0 } });
    const n = (id: string, sup: string | null, date: string) => ({
      id, learner_id: AN, tutor_member_id: "m", session_date: date, goals: "g", observed: null, support_level: "light", next_actions: [], practised_target_ids: [],
      published: true, supersedes_id: sup, created_at: `${date}T10:00:0${id === "b" ? 5 : 0}Z`,
    });
    const notes = parseNotes([n("a", null, "2026-10-01"), n("b", "a", "2026-10-01"), n("c", null, "2026-10-05")]);
    expect(notes.map((x) => [x.id, x.current])).toEqual([["c", true], ["b", true], ["a", false]]);
  });
});

describe("S5 handlers: writes", () => {
  it("scores are validated (400) only after access; a good body reaches the store with the member id, not the user id", async () => {
    const s = makeStore();
    for (const bad of [
      undefined, {}, { ...goodDecisions, items: [] },
      { ...goodDecisions, items: [{ target_id: "x", score: 5, not_observed: false }] },
      { ...goodDecisions, items: [{ target_id: "x", score: null, not_observed: false }] }, // neither
      { ...goodDecisions, items: [{ target_id: "x", score: 2, not_observed: true }] }, // both
      { ...goodDecisions, items: [{ target_id: "x", score: 0, not_observed: true }] }, // 0 is not NULL
      { ...goodDecisions, items: [{ target_id: "x", score: 1.5, not_observed: false }] },
      { ...goodDecisions, items: [{ target_id: "x", score: 1, not_observed: false }, { target_id: "x", score: 2, not_observed: false }] },
      { ...goodDecisions, client_id: "short" },
      { ...goodDecisions, extra: 1 },
    ]) {
      expect((await handleDecisions(deps("tutorAn", s), EP_AN, bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(s.recordReviews).not.toHaveBeenCalled();
    const ok = await handleDecisions(deps("tutorAn", s), EP_AN, {
      client_id: "client-0001",
      items: [
        { target_id: "A-L3-CAUSE-W", score: 3, not_observed: false, criteria: { c1: true }, rationale: " ok " },
        { target_id: "A-L2-CHUNKS", score: null, not_observed: true },
      ],
    });
    expect(ok.status).toBe(201);
    expect(s.recordReviews).toHaveBeenCalledWith({
      episodeId: EP_AN,
      byMemberId: "m-tutorAn",
      clientId: "client-0001",
      items: [
        { target_key: "A-L3-CAUSE-W", score: 3, not_observed: false, criteria: { c1: true }, rationale: "ok" },
        { target_key: "A-L2-CHUNKS", score: null, not_observed: true, criteria: null, rationale: null },
      ],
    });
  });

  it("D15: the database refusing a parent becomes 403 'tutor_only'; other refusals are plain 403", async () => {
    const d15 = makeStore({ recordReviews: vi.fn(async () => { throw new ReviewDbError("42501", "eng_record_review: this member may not review this episode (D15)"); }) });
    const r = await handleDecisions(deps("parent", d15), EP_AN, goodDecisions);
    expect(r.status).toBe(403);
    expect((r.body as { error: string }).error).toBe("tutor_only");
    expect(JSON.stringify(r.body)).not.toContain("eng_record_review");
    const other = makeStore({ recordReviews: vi.fn(async () => { throw new ReviewDbError("42501", "nope"); }) });
    expect(((await handleDecisions(deps("parent", other), EP_AN, goodDecisions)).body as { error: string }).error).toBe("forbidden");
  });

  it("maps database codes: 23505 → 409, 23514 / 22023 → 400, P0002 → 404; an unknown code is rethrown (500)", async () => {
    const thrower = (code: string) => makeStore({ modifyDecision: vi.fn(async () => { throw new ReviewDbError(code, "x"); }) });
    expect((await handleModify(deps("tutorAn", thrower("23505")), DEC_AN, goodModify)).status).toBe(409);
    expect((await handleModify(deps("tutorAn", thrower("23514")), DEC_AN, goodModify)).status).toBe(400);
    expect((await handleModify(deps("tutorAn", thrower("22023")), DEC_AN, goodModify)).status).toBe(400);
    expect((await handleModify(deps("tutorAn", thrower("P0002")), DEC_AN, goodModify)).status).toBe(404);
    await expect(handleModify(deps("tutorAn", thrower("XX000")), DEC_AN, goodModify)).rejects.toBeInstanceOf(ReviewDbError);
  });

  it("modify needs a reason of 3+ characters and a score XOR 'no opportunity'", async () => {
    const s = makeStore();
    for (const bad of [{ ...goodModify, reason: "ab" }, { ...goodModify, reason: "   " }, { ...goodModify, reason: undefined }, { ...goodModify, score: null }, { ...goodModify, score: 9 }]) {
      expect((await handleModify(deps("tutorAn", s), DEC_AN, bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(s.modifyDecision).not.toHaveBeenCalled();
    expect((await handleModify(deps("tutorAn", s), DEC_AN, { ...goodModify, score: null, not_observed: true })).status).toBe(201);
    expect(s.modifyDecision).toHaveBeenCalledWith({ decisionId: DEC_AN, score: null, notObserved: true, reason: "Chưa đủ ví dụ", byMemberId: "m-tutorAn", clientId: "client-0002" });
  });

  it("replays answer 200, new writes 201", async () => {
    const s = makeStore({ modifyDecision: vi.fn(async () => ({ decision_id: "d2", replayed: true })) });
    expect((await handleModify(deps("tutorAn", s), DEC_AN, goodModify)).status).toBe(200);
    const s2 = makeStore({ recordReviews: vi.fn(async () => [{ target_key: "A-L3-CAUSE-W", observation_id: "o", decision_id: "d", replayed: true }]) });
    expect((await handleDecisions(deps("tutorAn", s2), EP_AN, goodDecisions)).status).toBe(200);
  });

  it("support: kind and skills are validated; goes to the store with the member id", async () => {
    const s = makeStore();
    for (const bad of [{ ...goodSupport, kind: "magic" }, { ...goodSupport, target_ids: [] }, { ...goodSupport, note: "x".repeat(1001) }]) {
      expect((await handleSupport(deps("tutorAn", s), ATT_AN, bad)).status).toBe(400);
    }
    expect((await handleSupport(deps("parent", s), ATT_AN, goodSupport)).status).toBe(201);
    expect(s.recordSupport).toHaveBeenCalledWith({ attemptId: ATT_AN, targets: ["A-L3-CAUSE-W"], kind: "frame", note: "Cho câu mẫu", byMemberId: "m-parent", clientId: null });
  });

  it("offline work: the step must be the child's (404 otherwise), the body is validated, no audio field is accepted", async () => {
    const s = makeStore();
    expect((await handleOffline(deps("parent", s), AN, { ...goodOffline, activity_id: ACT_NGUYEN })).status).toBe(404);
    expect(s.recordOffline).not.toHaveBeenCalled();
    for (const bad of [
      { ...goodOffline, text: "   " }, { ...goodOffline, text: "x".repeat(20001) }, { ...goodOffline, provenance: "audio" }, { ...goodOffline, provenance: "in_app" },
      { ...goodOffline, session_date: "2026-02-30" }, { ...goodOffline, assistance: [] }, { ...goodOffline, assistance: ["none", "notes"] },
      { ...goodOffline, assistance: ["unknown", "notes"] }, { ...goodOffline, duration_sec: 7201 }, { ...goodOffline, audio: "blob:xyz" }, { ...goodOffline, client_id: "nope" },
    ]) {
      expect((await handleOffline(deps("tutorAn", s), AN, bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await handleOffline(deps("tutorAn", s), AN, goodOffline)).status).toBe(201);
    expect(s.recordOffline).toHaveBeenCalledWith(expect.objectContaining({ activityId: ACT_AN, provenance: "tutor_live", byMemberId: "m-tutorAn", durationSec: null, wordCount: null }));
    // the parent claiming "I watched live": the database says no
    const refuse = makeStore({ recordOffline: vi.fn(async () => { throw new ReviewDbError("42501", "this member may not record this work"); }) });
    expect((await handleOffline(deps("parent", refuse), AN, goodOffline)).status).toBe(403);
    // a checkpoint / live speaking step is the tutor's alone: the database says so (D15) and the route answers "tutor_only"
    const tutorOnly = makeStore({ recordOffline: vi.fn(async () => { throw new ReviewDbError("42501", "eng_record_offline_attempt: only a tutor may record this step (D15)"); }) });
    const denied = await handleOffline(deps("parent", tutorOnly), AN, goodOffline);
    expect(denied.status).toBe(403);
    expect((denied.body as { error: string }).error).toBe("tutor_only");
    // the two date rules get their own answers so the form can say what to change
    for (const [token, code] of [["date_before_last_attempt", "date_before_last_attempt"], ["step_not_open_on_date", "step_not_open_on_date"], ["backdate_too_early", "backdate_too_early"], ["backdate_not_allowed_for_step", "backdate_not_allowed_for_step"]] as const) {
      const st = makeStore({ recordOffline: vi.fn(async () => { throw new ReviewDbError("23514", `eng_record_offline_attempt: x (${token})`); }) });
      const r = await handleOffline(deps("tutorAn", st), AN, goodOffline);
      expect(r.status).toBe(400);
      expect((r.body as { error: string }).error).toBe(code);
    }
    // paper work dated before the assignment carries its reason (5-200 characters) to the database; nothing else changes
    const paper = makeStore();
    expect((await handleOffline(deps("parent", paper), AN, { ...goodOffline, provenance: "manual_import", backdate_reason: "  Nhập từ phiếu giấy pilot  " })).status).toBe(201);
    expect(paper.recordOffline).toHaveBeenCalledWith(expect.objectContaining({ backdateReason: "Nhập từ phiếu giấy pilot" }));
    await handleOffline(deps("parent", paper), AN, { ...goodOffline, provenance: "manual_import" });
    expect(paper.recordOffline).toHaveBeenLastCalledWith(expect.objectContaining({ backdateReason: null }));
    for (const reason of ["abcd", "x".repeat(201), 5]) {
      expect((await handleOffline(deps("parent", paper), AN, { ...goodOffline, provenance: "manual_import", backdate_reason: reason })).status, String(reason)).toBe(400);
    }
    const other = makeStore({ recordOffline: vi.fn(async () => { throw new ReviewDbError("23514", "this step is not open"); }) });
    expect(((await handleOffline(deps("tutorAn", other), AN, goodOffline)).body as { error: string }).error).toBe("invalid");
  });

  it("lesson note: at most 3 actions of 200 characters, levels from a fixed list, edits carry supersedes_id", async () => {
    const s = makeStore();
    for (const bad of [
      { ...goodNote, next_actions: ["a", "b", "c", "d"] }, { ...goodNote, next_actions: ["x".repeat(201)] }, { ...goodNote, support_level: "huge" },
      { ...goodNote, goals: "x".repeat(1001) }, { ...goodNote, session_date: "13/10/2026" }, { ...goodNote, supersedes_id: "nope" },
    ]) {
      expect((await handleWriteNote(deps("tutorAn", s), AN, bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(s.writeNote).not.toHaveBeenCalled();
    expect((await handleWriteNote(deps("tutorAn", s), AN, { ...goodNote, next_actions: ["a", "b", "c"], practised_target_ids: ["A-L3-CAUSE-S"], supersedes_id: EP_AN })).status).toBe(201);
    expect(s.writeNote).toHaveBeenCalledWith(expect.objectContaining({ learnerId: AN, nextActions: ["a", "b", "c"], practised: ["A-L3-CAUSE-S"], supersedes: EP_AN, byMemberId: "m-tutorAn", published: false }));
  });
});

describe("S5 schemas", () => {
  it("accept the documented shapes", () => {
    expect(decisionsBodySchema.safeParse(goodDecisions).success).toBe(true);
    expect(modifyBodySchema.safeParse(goodModify).success).toBe(true);
    expect(supportBodySchema.safeParse(goodSupport).success).toBe(true);
    expect(offlineBodySchema.safeParse(goodOffline).success).toBe(true);
    expect(noteBodySchema.safeParse(goodNote).success).toBe(true);
  });
});

describe("S5 support note: one limit of 300 everywhere", () => {
  it("zod accepts 300 characters (also with spaces around) and refuses 301 with its own answer; the database message is mapped too", async () => {
    const ok = "x".repeat(SUPPORT_NOTE_MAX);
    expect(supportBodySchema.safeParse({ ...goodSupport, note: ok }).success).toBe(true);
    expect(supportBodySchema.safeParse({ ...goodSupport, note: `  ${ok}  ` }).success).toBe(true);
    expect(supportBodySchema.safeParse({ ...goodSupport, note: `${ok}y` }).success).toBe(false);
    const s = makeStore();
    const long = await handleSupport(deps("tutorAn", s), ATT_AN, { ...goodSupport, note: `${ok}y` });
    expect(long.status).toBe(400);
    expect((long.body as { error: string }).error).toBe("note_too_long");
    expect(s.recordSupport).not.toHaveBeenCalled();
    const db = makeStore({ recordSupport: vi.fn(async () => { throw new ReviewDbError("22023", "eng_record_observed_support: the note is too long, at most 300 characters (note_too_long)"); }) });
    expect(((await handleSupport(deps("tutorAn", db), ATT_AN, goodSupport)).body as { error: string }).error).toBe("note_too_long");
  });
});

describe("S5 and the student screen", () => {
  it("an attempt recorded outside the app still parses for the student, and is shown only as 'offline'", () => {
    const raw = {
      supported: true, activity_id: ACT_AN, instance_id: "i", step_no: 3, activity_type: "ACT-SOURCE-QA", mode: "INDEPENDENT_CHECK", purpose: [], date: "2026-10-14",
      title_vi: "Núi lửa", big_question_en: "Q?", big_question_vi: "H?", shape: "answers", can_submit: false,
      step: { prompt_en: "Read", time_min: 10, self_check_vi: [], items: [] },
      attempts: [{ attempt_no: 1, submitted_at: "2026-10-13T05:00:00Z", provenance: "tutor_live" }, { attempt_no: 2, submitted_at: "2026-10-13T06:00:00Z", provenance: "manual_import" }],
      draft: null,
    };
    const v = toActivityView(raw, []);
    expect("attempts" in v && v.attempts.map((a) => a.provenance)).toEqual(["offline", "offline"]);
    expect(JSON.stringify(v)).not.toMatch(/tutor_live|manual_import/);
  });
});

describe("S7a G4: the reviewer's 'new topic / source' mark", () => {
  it("goes through work:review (student 403, other tutor 404), validates the body, reaches the store with the member and recomputes once", async () => {
    const s = makeStore();
    const afterWrite = vi.fn(async () => {});
    const d = (u: string | null) => ({ ...deps(u, s), afterWrite });
    expect((await handleMarkTransfer(d(null), EP_AN, { value: true })).status).toBe(401);
    expect((await handleMarkTransfer(d("studentAn"), EP_AN, { value: true })).status).toBe(403);
    expect((await handleMarkTransfer(d("tutorNguyen"), EP_AN, { value: true })).status).toBe(404);
    expect((await handleMarkTransfer(d("tutorAn"), "not-a-uuid", { value: true })).status).toBe(404);
    expect((await handleMarkTransfer(d("tutorAn"), EP_AN, { value: "yes" })).status).toBe(400);
    expect((await handleMarkTransfer(d("tutorAn"), EP_AN, { value: true, extra: 1 })).status).toBe(400);
    expect(s.markTransfer).not.toHaveBeenCalled();
    const ok = await handleMarkTransfer(d("tutorAn"), EP_AN, { value: true });
    expect(ok).toEqual({ status: 201, body: { value: true, replayed: false } });
    expect(s.markTransfer).toHaveBeenCalledWith({ episodeId: EP_AN, value: true, byMemberId: "m-tutorAn" });
    expect(afterWrite).toHaveBeenCalledTimes(1);
    const replay = makeStore({ markTransfer: vi.fn(async () => ({ value: true, replayed: true })) });
    expect((await handleMarkTransfer({ ...deps("tutorAn", replay), afterWrite }, EP_AN, { value: true })).status).toBe(200);
    expect(afterWrite).toHaveBeenCalledTimes(1);
  });

  it("a database refusal (D15 / not a first attempt) becomes a plain answer", async () => {
    const refuse = (code: string, tag: string) => makeStore({ markTransfer: vi.fn(async () => { throw new ReviewDbError(code, `eng_mark_episode_transfer: x (${tag})`); }) });
    expect((await handleMarkTransfer(deps("parent", refuse("42501", "not_reviewer")), EP_AN, { value: true })).status).toBe(403);
    expect((await handleMarkTransfer(deps("tutorAn", refuse("22023", "first_attempt_only")), EP_AN, { value: true })).status).toBe(400);
  });
});
