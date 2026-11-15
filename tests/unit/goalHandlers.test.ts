import { describe, expect, it, vi } from "vitest";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import { goalError } from "@/lib/goal/errors";
import { handleDecideGoal, handleProposeGoal, handleWithdrawGoal, type GoalDeps, type GoalStore } from "@/lib/goal/handlers";
import { decideBodySchema, proposeBodySchema, withdrawBodySchema } from "@/lib/goal/schemas";
import { ReviewDbError } from "@/lib/review/handlers";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const GOAL = "c0000000-0000-4000-8000-000000000001";
const mk = (id: string, role: Member["role"]): Member => ({ id: `m-${id}`, userId: `u-${id}`, familyId: FAMILY, role, displayName: id });
const members = [mk("parent", "parent"), mk("tutorAn", "tutor"), mk("tutorNguyen", "tutor"), mk("studentNguyen", "student"), mk("studentAn", "student")];
const learners: Learner[] = [
  { id: AN, familyId: FAMILY, memberId: "m-studentAn", alias: "An", trackId: "A", isTest: true, status: "active" },
  { id: NGUYEN, familyId: FAMILY, memberId: "m-studentNguyen", alias: "Nguyên", trackId: "B", isTest: true, status: "active" },
];
const rels: Relationship[] = [
  { memberId: "m-tutorAn", learnerId: AN, relation: "tutor", validFrom: new Date("2026-01-01"), validTo: null },
  { memberId: "m-tutorNguyen", learnerId: NGUYEN, relation: "tutor", validFrom: new Date("2026-01-01"), validTo: null },
  { memberId: "m-parent", learnerId: AN, relation: "parent", validFrom: new Date("2026-01-01"), validTo: null },
  { memberId: "m-parent", learnerId: NGUYEN, relation: "parent", validFrom: new Date("2026-01-01"), validTo: null },
];
const access: AccessStore = {
  getMemberByUserId: async (u) => members.find((m) => m.userId === u) ?? null,
  getLearner: async (id) => learners.find((l) => l.id === id) ?? null,
  getRelationships: async (m, l) => rels.filter((r) => r.memberId === m && r.learnerId === l),
};
const store = (over: Partial<GoalStore> = {}): GoalStore => ({
  getOwnProfile: vi.fn(async (u: string) => {
    const m = members.find((x) => x.userId === u);
    return m ? { role: m.role, learnerId: learners.find((l) => l.memberId === m.id)?.id ?? null } : null;
  }),
  propose: vi.fn(async () => ({ id: "x", replayed: false })),
  withdraw: vi.fn(async () => ({ id: "y", replayed: false })),
  decide: vi.fn(async () => ({ id: "z", pieces: 5, applies_from: "2026-11-16", replayed: false })),
  ...over,
});
const deps = (user: string | null, s: GoalStore): GoalDeps => ({ user: user ? { id: user } : null, store: s, access: { store: access } });
const untouched = (s: GoalStore) => [s.propose, s.withdraw, s.decide].every((f) => vi.mocked(f).mock.calls.length === 0);

describe("the child proposes and withdraws (only their own)", () => {
  it("no session = 401; staff = 403 and nothing reaches the store", async () => {
    for (const [u, status] of [[null, 401], ["u-parent", 403], ["u-tutorNguyen", 403]] as const) {
      const s = store();
      expect((await handleProposeGoal(deps(u, s), { client_id: "client-0001", pieces: 4 })).status, `${u}`).toBe(status);
      expect((await handleWithdrawGoal(deps(u, s), { client_id: "client-0002", goal_id: GOAL })).status, `${u}`).toBe(status);
      expect(untouched(s)).toBe(true);
    }
  });
  it("a student proposes: 201, then a replay answers 200; the body carries only the number and the id", async () => {
    const s = store();
    const r = await handleProposeGoal(deps("u-studentNguyen", s), { client_id: "client-0001", pieces: 4 });
    expect(r).toEqual({ status: 201, body: { ok: true, replayed: false } });
    expect(s.propose).toHaveBeenCalledWith({ pieces: 4, clientId: "client-0001" });
    const again = store({ propose: vi.fn(async () => ({ id: "x", replayed: true })) });
    expect((await handleProposeGoal(deps("u-studentNguyen", again), { client_id: "client-0001", pieces: 4 })).status).toBe(200);
  });
  it("bodies are strict: a start day, an applies_from, a learner id or a minute goal is a 400", async () => {
    for (const extra of [{ applies_from: "2026-11-16" }, { learner_id: AN }, { minutes: 90 }, { by: "m-parent" }]) {
      const s = store();
      expect((await handleProposeGoal(deps("u-studentNguyen", s), { client_id: "client-0001", pieces: 4, ...extra })).status).toBe(400);
      expect(untouched(s)).toBe(true);
    }
    expect(proposeBodySchema.safeParse({ client_id: "client-0001", pieces: 0 }).success).toBe(false);
    expect(proposeBodySchema.safeParse({ client_id: "client-0001", pieces: 15 }).success).toBe(false);
    expect(proposeBodySchema.safeParse({ client_id: "client-0001", pieces: 2.5 }).success).toBe(false);
    expect(withdrawBodySchema.safeParse({ client_id: "client-0001", goal_id: "x" }).success).toBe(false);
  });
  it("the database tags become short codes: out of range / a proposal waits → 400 / 409; a missing function → 409 goal_unavailable", async () => {
    const run = (e: ReviewDbError) => handleProposeGoal(deps("u-studentNguyen", store({ propose: vi.fn(async () => { throw e; }) })), { client_id: "client-0001", pieces: 4 });
    expect((await run(new ReviewDbError("22023", "x (out_of_range)"))).body).toMatchObject({ error: "out_of_range" });
    expect(await run(new ReviewDbError("23505", "x (pending_exists)"))).toMatchObject({ status: 409, body: { error: "pending_exists" } });
    expect(await run(new ReviewDbError("goal_unavailable", "missing"))).toMatchObject({ status: 409, body: { error: "goal_unavailable" } });
    expect((await handleWithdrawGoal(deps("u-studentNguyen", store({ withdraw: vi.fn(async () => { throw new ReviewDbError("22023", "x (bad_ref)"); }) })), { client_id: "client-0002", goal_id: GOAL })).body).toMatchObject({ error: "bad_ref" });
  });
});

describe("the tutor of the child decides; the parent only reads", () => {
  const BODY = { client_id: "client-0003", action: "accept" };
  it("no session = 401; the student = 403; the parent = 403; another child's tutor = 404; nothing reaches the store", async () => {
    for (const [u, status] of [[null, 401], ["u-studentNguyen", 403], ["u-parent", 403], ["u-tutorAn", 404]] as const) {
      const s = store();
      expect((await handleDecideGoal(deps(u, s), NGUYEN, GOAL, BODY)).status, `${u}`).toBe(status);
      expect(untouched(s)).toBe(true);
    }
  });
  it("the child's tutor accepts or adjusts; the actor is the signed-in member and the page's child is passed down", async () => {
    const s = store();
    expect(await handleDecideGoal(deps("u-tutorNguyen", s), NGUYEN, GOAL, BODY)).toEqual({ status: 201, body: { id: "z", pieces: 5, applies_from: "2026-11-16", replayed: false } });
    expect(s.decide).toHaveBeenLastCalledWith({ goalId: GOAL, action: "accept", pieces: null, byMemberId: "m-tutorNguyen", clientId: "client-0003", learnerId: NGUYEN });
    await handleDecideGoal(deps("u-tutorNguyen", s), NGUYEN, GOAL, { client_id: "client-0004", action: "adjust", pieces: 8 });
    expect(s.decide).toHaveBeenLastCalledWith({ goalId: GOAL, action: "adjust", pieces: 8, byMemberId: "m-tutorNguyen", clientId: "client-0004", learnerId: NGUYEN });
  });
  it("accepting never forwards a number; the start day cannot be sent; an adjustment needs a number from 1 to 14; a bad goal id is a 404", async () => {
    const s = store();
    expect(decideBodySchema.safeParse({ client_id: "client-0003", action: "adjust" }).success).toBe(false);
    expect(decideBodySchema.safeParse({ client_id: "client-0003", action: "adjust", pieces: 15 }).success).toBe(false);
    expect(decideBodySchema.safeParse({ client_id: "client-0003", action: "accept", applies_from: "2026-11-16" }).success).toBe(false);
    expect(decideBodySchema.safeParse({ client_id: "client-0003", action: "approve" }).success).toBe(false);
    await handleDecideGoal(deps("u-tutorNguyen", s), NGUYEN, GOAL, { client_id: "client-0003", action: "accept", pieces: 9 });
    expect(s.decide).toHaveBeenLastCalledWith(expect.objectContaining({ action: "accept", pieces: null }));
    expect((await handleDecideGoal(deps("u-tutorNguyen", s), NGUYEN, "not-a-uuid", BODY)).status).toBe(404);
  });
  it("replay answers 200; the SQL's refusals map to codes (tutor_only 403, already_answered 409, bad_pieces 400)", async () => {
    expect((await handleDecideGoal(deps("u-tutorNguyen", store({ decide: vi.fn(async () => ({ id: "z", pieces: 5, applies_from: "2026-11-16", replayed: true })) })), NGUYEN, GOAL, BODY)).status).toBe(200);
    const fail = (e: ReviewDbError) => handleDecideGoal(deps("u-tutorNguyen", store({ decide: vi.fn(async () => { throw e; }) })), NGUYEN, GOAL, BODY);
    expect(await fail(new ReviewDbError("42501", "x (tutor_only)"))).toMatchObject({ status: 403, body: { error: "tutor_only" } });
    expect(await fail(new ReviewDbError("23505", "x (already_answered)"))).toMatchObject({ status: 409, body: { error: "already_answered" } });
    expect(await fail(new ReviewDbError("22023", "x (bad_pieces)"))).toMatchObject({ status: 400, body: { error: "bad_pieces" } });
  });
});

describe("goalError", () => {
  it("an unknown database error is rethrown (a 500), never swallowed", () => {
    expect(() => goalError(new Error("boom"))).toThrow("boom");
    expect(() => goalError(new ReviewDbError("XX000", "internal"))).toThrow();
  });
});

describe("W4d · the work-week choice of an adult upload (schema)", () => {
  it("the staff body may say 'last' or 'this'; anything else, and the child's body, are refused", async () => {
    const { staffSubmitBodySchema, studentSubmitBodySchema } = await import("@/lib/practice/schemas");
    const core = { client_id: "abcdefgh1", attempt: "first", used_hint: null, files: [] };
    expect(staffSubmitBodySchema.safeParse({ ...core, work_week: "last" }).success).toBe(true);
    expect(staffSubmitBodySchema.safeParse({ ...core, work_week: "this" }).success).toBe(true);
    expect(staffSubmitBodySchema.safeParse(core).success).toBe(true);
    expect(staffSubmitBodySchema.safeParse({ ...core, work_week: "next" }).success).toBe(false);
    expect(staffSubmitBodySchema.safeParse({ ...core, work_week: "2026-11-09" }).success).toBe(false);
    expect(studentSubmitBodySchema.safeParse({ ...core, assignment_id: "c0000000-0000-4000-8000-000000000002", used_hint: false, work_week: "last" }).success).toBe(false);
  });
});

describe("goalError: an untagged 23505 (the unique index on responds_to)", () => {
  it("is the clear 'already_answered' 409, not a generic server error", () => {
    const r = goalError(new ReviewDbError("23505", 'duplicate key value violates unique constraint "weekly_goals_one_answer"'));
    expect(r.status).toBe(409);
    expect((r.body as { error: string }).error).toBe("already_answered");
  });
});
