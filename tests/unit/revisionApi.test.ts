import { describe, expect, it, vi } from "vitest";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import { feedbackCopy } from "@/lib/copy/vi";
import { ReviewDbError } from "@/lib/review/handlers";
import { parseInbox } from "@/lib/review/shape";
import { revisionFailText } from "@/lib/revision/client";
import { handleFinishRevision, handleWriteFeedback, type RevisionDeps, type RevisionStore } from "@/lib/revision/handlers";
import { feedbackBodySchema, finishBodySchema, revisionDraftBodySchema, revisionSubmitBodySchema } from "@/lib/revision/schemas";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const WORK = "c0000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-22T08:00:00Z");
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
const store = (over: Partial<RevisionStore> = {}) =>
  ({
    getAttemptLearnerId: vi.fn(async (id: string) => (id === WORK ? AN : null)),
    writeFeedback: vi.fn(async (): Promise<unknown> => ({ id: "f1", round: 1, revision_activity_id: "r1", replayed: false })),
    finishRevision: vi.fn(async (): Promise<unknown> => ({ closing_id: "c1", feedback_id: null, revision_activity_id: null, replayed: false })),
    ...over,
  }) satisfies RevisionStore;
const deps = (user: string | null, s: RevisionStore): RevisionDeps => ({ user: user ? { id: `u-${user}` } : null, store: s, access: { store: access, allowRealLearners: false, now: NOW } });
const feedback = { client_id: "feedback-0001", praise: " Con giải thích rõ. ", items: [{ text: "Thêm câu kết.", excerpt: "lava flow" }, { text: "Thêm từ nối.", leaf: { kind: "tag", ref_key: "a-linkers" } }], requires_revision: true };

describe("request bodies", () => {
  it("feedback: praise ≤ 160, 1-3 items ≤ 200, excerpt ≤ 120, leaf {kind, ref_key}; unknown keys refused", () => {
    expect(feedbackBodySchema.safeParse(feedback).success).toBe(true);
    for (const bad of [
      { ...feedback, praise: "" }, { ...feedback, praise: "x".repeat(161) }, { ...feedback, items: [] }, { ...feedback, items: [{ text: "a" }, { text: "b" }, { text: "c" }, { text: "d" }] },
      { ...feedback, items: [{ text: "x".repeat(201) }] }, { ...feedback, items: [{ text: "a", excerpt: "x".repeat(121) }] }, { ...feedback, items: [{ text: "a", leaf: { kind: "group", ref_key: "x" } }] },
      { ...feedback, score: 3 }, { ...feedback, supersedes_id: "nope" },
    ]) expect(feedbackBodySchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });

  it("finish: close with an optional note, or round 2 with new feedback; verdicts from the list", () => {
    expect(finishBodySchema.safeParse({ action: "close", client_id: "finish-0001", checks: [{ n: 1, verdict: "improved" }] }).success).toBe(true);
    expect(finishBodySchema.safeParse({ action: "round2", client_id: "finish-0001", checks: [{ n: 1, verdict: "not_yet" }], praise: "Tốt", items: [{ text: "Thêm ví dụ." }] }).success).toBe(true);
    expect(finishBodySchema.safeParse({ action: "round2", client_id: "finish-0001", checks: [{ n: 1, verdict: "not_yet" }] }).success).toBe(false);
    expect(finishBodySchema.safeParse({ action: "close", client_id: "finish-0001", checks: [{ n: 1, verdict: "great" }] }).success).toBe(false);
    expect(finishBodySchema.safeParse({ action: "close", client_id: "finish-0001", checks: [{ n: 1, verdict: "improved" }], closing_note: "x".repeat(301) }).success).toBe(false);
  });

  it("the child's draft and submit: marks keyed 1-3, choice changed / kept, reason ≤ 300, help declared", () => {
    expect(revisionDraftBodySchema.safeParse({ content: { text: "x", marks: { "1": { choice: "kept" } } }, base_revision: 0 }).success).toBe(true);
    expect(revisionDraftBodySchema.safeParse({ content: { marks: { "4": { choice: "kept" } } } }).success).toBe(false);
    expect(revisionDraftBodySchema.safeParse({ content: { answers: {} } }).success).toBe(false);
    const submit = { client_submission_id: "a1111111-1111-4111-8111-111111111111", text: "New text.", marks: { "1": { choice: "changed" } }, assistance: ["none"], provenance: "in_app" };
    expect(revisionSubmitBodySchema.safeParse(submit).success).toBe(true);
    expect(revisionSubmitBodySchema.safeParse({ ...submit, marks: { "1": {} } }).success).toBe(false);
    expect(revisionSubmitBodySchema.safeParse({ ...submit, assistance: ["none", "notes"] }).success).toBe(false);
    expect(revisionSubmitBodySchema.safeParse({ ...submit, marks: { "1": { choice: "changed", reason: "x".repeat(301) } } }).success).toBe(false);
  });
});

describe("handleWriteFeedback", () => {
  it("the child's tutor or the parent sends; the store gets the cleaned body and the member id; a replay answers 200", async () => {
    const s = store();
    expect(await handleWriteFeedback(deps("tutorAn", s), WORK, feedback)).toEqual({ status: 201, body: { id: "f1", round: 1, revision_activity_id: "r1", replayed: false } });
    expect(s.writeFeedback).toHaveBeenCalledWith({
      attemptId: WORK, praise: "Con giải thích rõ.", requiresRevision: true, supersedesId: null, byMemberId: "m-tutorAn", clientId: "feedback-0001",
      items: [{ text: "Thêm câu kết.", excerpt: "lava flow", leaf: null }, { text: "Thêm từ nối.", excerpt: null, leaf: { kind: "tag", ref_key: "a-linkers" } }],
    });
    const again = store({ writeFeedback: vi.fn(async (): Promise<unknown> => ({ id: "f1", round: 1, revision_activity_id: "r1", replayed: true })) });
    expect((await handleWriteFeedback(deps("parent", again), WORK, feedback)).status).toBe(200);
  });

  it("access first (401 / 404 other tutor / 403 student) - before the body; score words are refused before the database", async () => {
    const s = store();
    expect((await handleWriteFeedback(deps(null, s), WORK, "x")).status).toBe(401);
    expect((await handleWriteFeedback(deps("tutorNguyen", s), WORK, feedback)).status).toBe(404);
    expect((await handleWriteFeedback(deps("studentAn", s), WORK, feedback)).status).toBe(403);
    expect((await handleWriteFeedback(deps("tutorAn", s), "not-a-uuid", feedback)).status).toBe(404);
    expect(await handleWriteFeedback(deps("tutorAn", s), WORK, { ...feedback, praise: "Được 3/4" })).toMatchObject({ status: 400, body: { error: "score_words" } });
    expect(await handleWriteFeedback(deps("tutorAn", s), WORK, { ...feedback, items: [{ text: "Đúng 80%" }] })).toMatchObject({ status: 400, body: { error: "score_words" } });
    expect(await handleWriteFeedback(deps("tutorAn", s), WORK, { ...feedback, praise: "" })).toMatchObject({ status: 400, body: { error: "praise_required" } });
    expect(await handleWriteFeedback(deps("tutorAn", s), WORK, { ...feedback, items: [{ text: "a", excerpt: "x".repeat(121) }] })).toMatchObject({ status: 400, body: { error: "excerpt_too_long" } });
    expect(s.writeFeedback).not.toHaveBeenCalled();
  });

  it("maps the database answers to codes the panel can explain", async () => {
    const cases: [string, string, number, string][] = [
      ["42501", "eng_write_feedback: … (D15)", 403, "tutor_only"],
      ["42501", "x (author_only)", 403, "author_only"],
      ["23514", "x (revision_started)", 409, "revision_started"],
      ["23514", "x (excerpt_not_found)", 400, "excerpt_not_found"],
      ["23514", "x (unknown_leaf)", 400, "unknown_leaf"],
      ["23514", "x (not_writing)", 400, "not_writing"],
      ["23505", "x (already_given)", 409, "already_given"],
      ["23505", "x (already_superseded)", 409, "already_superseded"],
      ["23505", "x client id was already used", 409, "conflict"],
      ["P0002", "x (not_found)", 404, "not_found"],
    ];
    for (const [code, detail, status, error] of cases) {
      const s = store({ writeFeedback: vi.fn(async (): Promise<unknown> => { throw new ReviewDbError(code, detail); }) });
      expect(await handleWriteFeedback(deps("tutorAn", s), WORK, feedback), detail).toMatchObject({ status, body: { error } });
    }
  });
});

describe("handleFinishRevision", () => {
  it("close with a trimmed note, or round 2 with feedback; scores refused; database answers mapped", async () => {
    const s = store();
    expect((await handleFinishRevision(deps("tutorAn", s), WORK, { action: "close", client_id: "finish-0001", checks: [{ n: 1, verdict: "improved" }], closing_note: "  Tốt lắm! " })).status).toBe(201);
    expect(s.finishRevision).toHaveBeenCalledWith({
      attemptId: WORK, action: "close", checks: [{ n: 1, verdict: "improved" }], closingNote: "Tốt lắm!", praise: null, items: null, byMemberId: "m-tutorAn", clientId: "finish-0001",
    });
    await handleFinishRevision(deps("tutorAn", s), WORK, { action: "round2", client_id: "finish-0002", checks: [{ n: 1, verdict: "not_yet" }], praise: "Tốt", items: [{ text: "Thêm ví dụ." }] });
    expect(s.finishRevision).toHaveBeenLastCalledWith(expect.objectContaining({ action: "round2", closingNote: null, praise: "Tốt", items: [{ text: "Thêm ví dụ.", excerpt: null, leaf: null }] }));
    expect(await handleFinishRevision(deps("tutorAn", s), WORK, { action: "close", client_id: "finish-0003", checks: [{ n: 1, verdict: "improved" }], closing_note: "Được 4/4" }))
      .toMatchObject({ status: 400, body: { error: "score_words" } });
    for (const [code, detail, status, error] of [["23514", "x (checks_incomplete)", 400, "checks_incomplete"], ["23505", "x (already_finished)", 409, "already_finished"],
      ["23514", "x (max_rounds)", 400, "max_rounds"], ["22023", "x (bad_verdict)", 400, "invalid"]] as [string, string, number, string][]) {
      const bad = store({ finishRevision: vi.fn(async (): Promise<unknown> => { throw new ReviewDbError(code, detail); }) });
      expect(await handleFinishRevision(deps("tutorAn", bad), WORK, { action: "close", client_id: "finish-0004", checks: [{ n: 1, verdict: "improved" }] })).toMatchObject({ status, body: { error } });
    }
  });
});

describe("words and the inbox", () => {
  it("every S6 error code has a sentence; unknown codes fall back to the shared ones", () => {
    for (const code of Object.keys(feedbackCopy.errors)) expect(revisionFailText({ ok: false, status: 400, error: code })).toBe(feedbackCopy.errors[code]);
    expect(revisionFailText({ ok: false, status: 0, error: "network" })).toBeTruthy();
  });
  it("an inbox row carries the revision round (null for ordinary work and for an older database)", () => {
    const row = { episode_id: "e", attempt_id: "a", learner_id: AN, alias: "An", is_test: true, title_vi: "Núi lửa", step_no: 1001, activity_type: "ACT-REVISE", mode: "REVISION",
      purpose: [], provenance: "in_app", attempt_no: 2, is_first_attempt: false, submitted_at: "2026-10-22T01:00:00Z", restricted: false, category: "practice",
      targets_total: 3, targets_decided: 0, can_decide: true };
    const counts = { todo: 1, tutor: 0, independent: 0, baseline: 0, practice: 1, done: 0, to_decide: 1 };
    expect(parseInbox({ items: [{ ...row, revision_round: 2 }], next: null, counts }).items[0]?.revisionRound).toBe(2);
    expect(parseInbox({ items: [row], next: null, counts }).items[0]?.revisionRound).toBeNull();
  });
});
