import { describe, expect, it, vi } from "vitest";
import { actionCardError } from "@/lib/actioncards/errors";
import { handleDecideActionCard, type ActionCardDeps, type ActionCardStore } from "@/lib/actioncards/handlers";
import { decideBodySchema } from "@/lib/actioncards/schemas";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import { ReviewDbError } from "@/lib/review/handlers";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const mk = (id: string, role: Member["role"]): Member => ({ id: `m-${id}`, userId: `u-${id}`, familyId: FAMILY, role, displayName: id });
const members = [mk("parent", "parent"), mk("tutorAn", "tutor"), mk("tutorNguyen", "tutor"), mk("studentNguyen", "student"), mk("outsider", "parent")];
members[4] = { ...members[4]!, familyId: "f0000000-0000-4000-8000-000000000099" };
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
const store = (over: Partial<ActionCardStore> = {}): ActionCardStore => ({ decide: vi.fn(async () => ({ id: "x", at: "2026-11-26T01:00:00Z", replayed: false })), ...over });
const deps = (user: string | null, s: ActionCardStore): ActionCardDeps => ({ user: user ? { id: user } : null, store: s, access: { store: access } });
const body = (o: Record<string, unknown> = {}) => ({
  client_id: "client-0001", card_key: "fix-i1-E", kind: "fix_together", label: "Chữa bài cùng con: Unit 15 · phần E", evidence_at: "2026-11-24T04:53:00Z", decision: "done", ...o,
});

describe("POST /api/learners/:id/action-cards", () => {
  it("no session 401; a student is refused; the other child's tutor and an outsider get 404; nothing reaches the store", async () => {
    for (const [u, status] of [[null, 401], ["u-studentNguyen", 403], ["u-tutorAn", 404], ["u-outsider", 404]] as const) {
      const s = store();
      expect((await handleDecideActionCard(deps(u, s), NGUYEN, body())).status, `${u}`).toBe(status);
      expect(s.decide).not.toHaveBeenCalled();
    }
  });
  it("the child's tutor marks a card: 201, then a replay is 200; the member and the child come from the session and the URL", async () => {
    const s = store();
    expect(await handleDecideActionCard(deps("u-tutorNguyen", s), NGUYEN, body())).toEqual({ status: 201, body: { id: "x", at: "2026-11-26T01:00:00Z", replayed: false } });
    expect(s.decide).toHaveBeenCalledWith({
      learnerId: NGUYEN, cardKey: "fix-i1-E", kind: "fix_together", label: "Chữa bài cùng con: Unit 15 · phần E", evidenceAt: "2026-11-24T04:53:00Z", decision: "done", reason: null, byMemberId: "m-tutorNguyen", clientId: "client-0001",
    });
    const again = store({ decide: vi.fn(async () => ({ id: "x", at: "t", replayed: true })) });
    expect((await handleDecideActionCard(deps("u-tutorNguyen", again), NGUYEN, body())).status).toBe(200);
    expect((await handleDecideActionCard(deps("u-parent", store()), NGUYEN, body())).status).toBe(201); // the parent may mark too (the screen gives the buttons to the tutor)
  });
  it("skipping needs a reason of 3+ characters (400 reason_required); bodies are strict; the grade card cannot be marked", async () => {
    const s = store();
    expect((await handleDecideActionCard(deps("u-tutorNguyen", s), NGUYEN, body({ decision: "skipped" }))).body).toMatchObject({ error: "reason_required" });
    expect((await handleDecideActionCard(deps("u-tutorNguyen", s), NGUYEN, body({ decision: "skipped", reason: " a " }))).body).toMatchObject({ error: "reason_required" });
    for (const extra of [{ learner_id: AN }, { by: "m-parent" }, { kind: "grade" }, { decision: "later" }, { evidence_at: "yesterday" }, { reason: "x".repeat(301) }]) {
      expect((await handleDecideActionCard(deps("u-tutorNguyen", s), NGUYEN, body(extra))).status, JSON.stringify(extra)).toBe(400);
    }
    expect(s.decide).not.toHaveBeenCalled();
    const ok = store();
    await handleDecideActionCard(deps("u-tutorNguyen", ok), NGUYEN, body({ decision: "skipped", reason: "  đã chữa ngoài app " }));
    expect(ok.decide).toHaveBeenCalledWith(expect.objectContaining({ decision: "skipped", reason: "đã chữa ngoài app" }));
    expect(decideBodySchema.safeParse(body({ evidence_at: null })).success).toBe(true);
  });
  it("database answers: 0043 missing → 409 cards_unavailable; tagged errors → 400 / 404; the actor check → 403", () => {
    expect(actionCardError(new ReviewDbError("cards_unavailable", "missing"))).toMatchObject({ status: 409, body: { error: "cards_unavailable" } });
    expect(actionCardError(new ReviewDbError("22023", "x (reason_required)"))).toMatchObject({ status: 400, body: { error: "reason_required" } });
    expect(actionCardError(new ReviewDbError("P0002", "x (not_found)"))).toMatchObject({ status: 404 });
    expect(actionCardError(new ReviewDbError("42501", "may not act"))).toMatchObject({ status: 403 });
  });
});
