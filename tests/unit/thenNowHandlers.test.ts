import { describe, expect, it, vi } from "vitest";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import { thenNowError } from "@/lib/thennow/errors";
import { handlePickThenNow, type ThenNowDeps, type ThenNowStore } from "@/lib/thennow/handlers";
import { pickBodySchema } from "@/lib/thennow/schemas";
import { ReviewDbError } from "@/lib/review/handlers";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const P1 = "c0000000-0000-4000-8000-000000000001";
const P2 = "c0000000-0000-4000-8000-000000000002";
const mk = (id: string, role: Member["role"]): Member => ({ id: `m-${id}`, userId: `u-${id}`, familyId: FAMILY, role, displayName: id });
const members = [mk("parent", "parent"), mk("tutorAn", "tutor"), mk("tutorNguyen", "tutor"), mk("studentNguyen", "student"), mk("studentAn", "student"), mk("outsider", "parent")];
members[5] = { ...members[5]!, familyId: "f0000000-0000-4000-8000-000000000099" };
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
const store = (over: Partial<ThenNowStore> = {}): ThenNowStore => ({ pick: vi.fn(async () => ({ id: "x", replayed: false })), ...over });
const deps = (user: string | null, s: ThenNowStore): ThenNowDeps => ({ user: user ? { id: user } : null, store: s, access: { store: access } });
const body = (o: Record<string, unknown> = {}) => ({ client_id: "client-0001", then_id: P1, now_id: P2, note: "Hai tháng đấy!", status: "shown", ...o });

describe("POST /api/learners/:id/then-now", () => {
  it("no session 401; the parent, a student and the other child's tutor are refused before the store; an outsider gets 404", async () => {
    for (const [u, status] of [[null, 401], ["u-parent", 403], ["u-studentNguyen", 403], ["u-tutorAn", 404], ["u-outsider", 404]] as const) {
      const s = store();
      expect((await handlePickThenNow(deps(u, s), NGUYEN, body())).status, `${u}`).toBe(status);
      expect(s.pick).not.toHaveBeenCalled();
    }
  });
  it("the child's tutor picks: 201 with the id, then a replay is 200; the tutor's id and the child of the page are passed, never taken from the body", async () => {
    const s = store();
    expect(await handlePickThenNow(deps("u-tutorNguyen", s), NGUYEN, body())).toEqual({ status: 201, body: { id: "x", replayed: false } });
    expect(s.pick).toHaveBeenCalledWith({ learnerId: NGUYEN, thenId: P1, nowId: P2, note: "Hai tháng đấy!", status: "shown", byMemberId: "m-tutorNguyen", clientId: "client-0001" });
    const again = store({ pick: vi.fn(async () => ({ id: "x", replayed: true })) });
    expect((await handlePickThenNow(deps("u-tutorNguyen", again), NGUYEN, body())).status).toBe(200);
  });
  it("bodies are strict: another learner, a member id or an unknown status is a 400", async () => {
    for (const extra of [{ learner_id: AN }, { by: "m-parent" }, { status: "gone" }, { then_id: "nope" }]) {
      const s = store();
      expect((await handlePickThenNow(deps("u-tutorNguyen", s), NGUYEN, body(extra))).status).toBe(400);
      expect(s.pick).not.toHaveBeenCalled();
    }
    expect(pickBodySchema.safeParse(body()).success).toBe(true);
    expect(pickBodySchema.safeParse(body({ note: null })).success).toBe(true);
  });
  it("the note: 200 characters at most (400 too_long), never score-like (400 score_words), empty becomes none", async () => {
    const s = store();
    expect(await handlePickThenNow(deps("u-tutorNguyen", s), NGUYEN, body({ note: "a".repeat(201) }))).toMatchObject({ status: 400, body: { error: "too_long" } });
    for (const note of ["Con được 8/10", "9 điểm", "Tăng 40%", "Đạt yêu cầu"]) {
      expect(await handlePickThenNow(deps("u-tutorNguyen", s), NGUYEN, body({ note })), note).toMatchObject({ status: 400, body: { error: "score_words" } });
    }
    expect(s.pick).not.toHaveBeenCalled();
    await handlePickThenNow(deps("u-tutorNguyen", s), NGUYEN, body({ note: "   " }));
    expect(s.pick).toHaveBeenCalledWith(expect.objectContaining({ note: null }));
  });
  it("database tags become short codes: tutor_only 403, bad_pick 400, client_id_reused 409; before 0036 the answer is 409 thennow_unavailable, never 500", async () => {
    const run = (e: Error) => handlePickThenNow(deps("u-tutorNguyen", store({ pick: vi.fn(async () => { throw e; }) })), NGUYEN, body());
    expect(await run(new ReviewDbError("42501", "x (tutor_only)"))).toMatchObject({ status: 403, body: { error: "tutor_only" } });
    expect(await run(new ReviewDbError("22023", "x (bad_pick)"))).toMatchObject({ status: 400, body: { error: "bad_pick" } });
    expect(await run(new ReviewDbError("23505", "x (client_id_reused)"))).toMatchObject({ status: 409, body: { error: "client_id_reused" } });
    expect(await run(new ReviewDbError("thennow_unavailable", "missing"))).toMatchObject({ status: 409, body: { error: "thennow_unavailable" } });
    expect(thenNowError(new ReviewDbError("22023", "x (score_words)")).body).toMatchObject({ error: "score_words" });
  });
});
