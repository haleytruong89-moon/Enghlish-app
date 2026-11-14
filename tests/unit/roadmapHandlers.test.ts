import { describe, expect, it, vi } from "vitest";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import { ReviewDbError } from "@/lib/review/handlers";
import { roadmapError } from "@/lib/roadmap/errors";
import { handleSetMainCurriculum, handleWriteMilestone, type RoadmapDeps, type RoadmapStore } from "@/lib/roadmap/handlers";
import { mainBodySchema, milestoneBodySchema } from "@/lib/roadmap/schemas";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const MS = "c0000000-0000-4000-8000-000000000001";
const CUR = "d0000000-0000-4000-8000-000000000001";
const mk = (id: string, role: Member["role"]): Member => ({ id: `m-${id}`, userId: `u-${id}`, familyId: FAMILY, role, displayName: id });
const members = [mk("parent", "parent"), mk("tutorAn", "tutor"), mk("tutorNguyen", "tutor"), mk("studentNguyen", "student")];
const learners: Learner[] = [
  { id: AN, familyId: FAMILY, memberId: null, alias: "An", trackId: "A", isTest: true, status: "active" },
  { id: NGUYEN, familyId: FAMILY, memberId: "m-studentNguyen", alias: "Nguyên", trackId: "B", isTest: true, status: "active" },
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
const store = (over: Partial<RoadmapStore> = {}): RoadmapStore => ({
  writeMilestone: vi.fn(async () => ({ milestone_id: MS, version: 1, replayed: false })),
  setMain: vi.fn(async () => ({ id: "x1", replayed: false })),
  ...over,
});
const deps = (user: string | null, s: RoadmapStore): RoadmapDeps => ({ user: user ? { id: user } : null, store: s, access: { store: access } });
const BODY = { client_id: "client-0001", status: "confirmed", fields: { kind: "progress_test", role: "flag", title: "Progress Test 1", curriculum_id: CUR, after_unit: "U12" } };
const touched = (s: RoadmapStore) => [s.writeMilestone, s.setMain].every((f) => vi.mocked(f).mock.calls.length === 0);

describe("roadmap routes: access first, the child's tutor only", () => {
  it("no session = 401; a student = 403; the parent = 403 (read-only); another child's tutor = 404; nothing reaches the store", async () => {
    for (const [u, status] of [[null, 401], ["u-studentNguyen", 403], ["u-parent", 403], ["u-tutorAn", 404]] as const) {
      const s = store();
      expect((await handleWriteMilestone(deps(u, s), NGUYEN, BODY)).status, `${u}`).toBe(status);
      expect((await handleSetMainCurriculum(deps(u, s), NGUYEN, { client_id: "client-0002", curriculum_id: CUR })).status, `${u}`).toBe(status);
      expect(touched(s)).toBe(true);
    }
  });
  it("the child's tutor writes; the body is passed with the signed-in member as the actor", async () => {
    const s = store();
    const r = await handleWriteMilestone(deps("u-tutorNguyen", s), NGUYEN, BODY);
    expect(r).toEqual({ status: 201, body: { milestone_id: MS, version: 1, replayed: false } });
    expect(s.writeMilestone).toHaveBeenCalledWith({
      learnerId: NGUYEN, milestoneId: null, baseVersion: null, fields: BODY.fields, status: "confirmed", reason: null, proposalKey: null, byMemberId: "m-tutorNguyen", clientId: "client-0001",
    });
    expect((await handleSetMainCurriculum(deps("u-tutorNguyen", s), NGUYEN, { client_id: "client-0002", curriculum_id: CUR })).status).toBe(201);
  });
  it("a replay answers 200", async () => {
    const s = store({ writeMilestone: vi.fn(async () => ({ milestone_id: MS, version: 1, replayed: true })) });
    expect((await handleWriteMilestone(deps("u-tutorNguyen", s), NGUYEN, BODY)).status).toBe(200);
  });
});

describe("roadmap bodies (zod)", () => {
  it("a new milestone needs fields; an edit needs milestone_id AND base_version; removing needs a reason; a proposal key only on a new milestone", () => {
    expect(milestoneBodySchema.safeParse({ client_id: "client-0001", status: "draft" }).success).toBe(false);
    expect(milestoneBodySchema.safeParse({ ...BODY, milestone_id: MS }).success).toBe(false);
    expect(milestoneBodySchema.safeParse({ client_id: "client-0001", status: "confirmed", milestone_id: MS, base_version: 2 }).success).toBe(true);
    expect(milestoneBodySchema.safeParse({ client_id: "client-0001", status: "removed", milestone_id: MS, base_version: 2 }).success).toBe(false);
    expect(milestoneBodySchema.safeParse({ client_id: "client-0001", status: "removed", milestone_id: MS, base_version: 2, reason: "xx" }).success).toBe(false);
    expect(milestoneBodySchema.safeParse({ client_id: "client-0001", status: "removed", milestone_id: MS, base_version: 2, reason: "lịch thi đổi" }).success).toBe(true);
    expect(milestoneBodySchema.safeParse({ client_id: "client-0001", status: "removed", fields: BODY.fields, proposal_key: "pt:x:y", reason: "không làm" }).success).toBe(true);
    expect(milestoneBodySchema.safeParse({ client_id: "client-0001", status: "confirmed", milestone_id: MS, base_version: 1, proposal_key: "pt:x:y" }).success).toBe(false);
    expect(milestoneBodySchema.safeParse({ ...BODY, extra: 1 }).success).toBe(false);
    expect(milestoneBodySchema.safeParse({ ...BODY, fields: { ...BODY.fields, target_month: "2027-13" } }).success).toBe(false);
    expect(milestoneBodySchema.safeParse({ ...BODY, fields: { ...BODY.fields, title: "   " } }).success).toBe(false);
    expect(mainBodySchema.safeParse({ client_id: "client-0002", curriculum_id: "nope" }).success).toBe(false);
  });
  it("an invalid body is 400 after access (outsiders never learn the shape)", async () => {
    const s = store();
    expect((await handleWriteMilestone(deps("u-tutorNguyen", s), NGUYEN, { nope: 1 })).status).toBe(400);
    expect((await handleWriteMilestone(deps("u-tutorAn", s), NGUYEN, { nope: 1 })).status).toBe(404);
    expect(touched(s)).toBe(true);
  });
});

describe("roadmapError: database tags → short codes", () => {
  const e = (code: string, tag: string) => roadmapError(new ReviewDbError(code, `eng_roadmap_write: x (${tag})`));
  it("maps each tag to its status and code", () => {
    expect(e("23505", "stale_version")).toMatchObject({ status: 409, body: { error: "stale_version" } });
    expect(e("23514", "summit_exists")).toMatchObject({ status: 400, body: { error: "summit_exists" } });
    expect(e("23514", "reason_required")).toMatchObject({ status: 400, body: { error: "reason_required" } });
    expect(e("22023", "bad_unit")).toMatchObject({ status: 400, body: { error: "bad_unit" } });
    expect(e("42501", "tutor_only")).toMatchObject({ status: 403, body: { error: "tutor_only" } });
    expect(e("23505", "proposal_used")).toMatchObject({ status: 409, body: { error: "proposal_used" } });
    expect(roadmapError(new ReviewDbError("roadmap_unavailable", "missing"))).toMatchObject({ status: 409, body: { error: "roadmap_unavailable" } });
    expect(roadmapError(new ReviewDbError("P0002", "x"))).toMatchObject({ status: 404 });
  });
});
