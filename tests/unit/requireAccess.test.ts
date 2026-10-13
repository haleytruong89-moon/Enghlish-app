import { describe, expect, it } from "vitest";
import {
  AccessError,
  requireAccess,
  type AccessStore,
  type Action,
  type Learner,
  type Member,
  type Relationship,
} from "@/lib/auth/requireAccess";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const OTHER_FAMILY = "f0000000-0000-4000-8000-000000000002";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const REAL = "c0000000-0000-4000-8000-000000000001";
const FOREIGN = "d0000000-0000-4000-8000-000000000001";
const MISSING = "e0000000-0000-4000-8000-000000000099";

const NOW = new Date("2026-10-13T08:00:00Z");
const DAY = 86_400_000;

const member = (id: string, role: Member["role"], familyId = FAMILY): Member => ({
  id: `m-${id}`,
  userId: `u-${id}`,
  familyId,
  role,
  displayName: id,
});

const members = [
  member("parent", "parent"),
  member("tutorAn", "tutor"),
  member("tutorNguyen", "tutor"),
  member("tutorExpired", "tutor"),
  member("tutorFuture", "tutor"),
  member("studentAn", "student"),
  member("studentNguyen", "student"),
  member("otherParent", "parent", OTHER_FAMILY),
];

const learner = (id: string, memberId: string | null, trackId: "A" | "B", isTest = true, familyId = FAMILY): Learner => ({
  id,
  familyId,
  memberId,
  alias: id,
  trackId,
  isTest,
  status: "active",
});

const learners = [
  learner(AN, "m-studentAn", "A"),
  learner(NGUYEN, "m-studentNguyen", "B"),
  learner(REAL, null, "A", false),
  learner(FOREIGN, null, "A", true, OTHER_FAMILY),
];

const rel = (memberId: string, learnerId: string, relation: Relationship["relation"], from: number, to: number | null): Relationship => ({
  memberId,
  learnerId,
  relation,
  validFrom: new Date(NOW.getTime() + from * DAY),
  validTo: to === null ? null : new Date(NOW.getTime() + to * DAY),
});

const relationships = [
  rel("m-tutorAn", AN, "tutor", -30, null),
  rel("m-tutorAn", REAL, "tutor", -30, null),
  rel("m-tutorNguyen", NGUYEN, "tutor", -30, null),
  rel("m-tutorExpired", AN, "tutor", -60, -1),
  rel("m-tutorFuture", AN, "tutor", 1, null),
];

const store: AccessStore = {
  getMemberByUserId: async (userId) => members.find((m) => m.userId === userId) ?? null,
  getLearner: async (id) => learners.find((l) => l.id === id) ?? null,
  getRelationships: async (memberId, learnerId) =>
    relationships.filter((r) => r.memberId === memberId && r.learnerId === learnerId),
};

const deps = { store, allowRealLearners: false, now: NOW };

async function status(userKey: string | null, learnerId: string, action: Action = "learner:read", allowReal = false) {
  try {
    await requireAccess(userKey ? { id: `u-${userKey}` } : null, learnerId, action, { ...deps, allowRealLearners: allowReal });
    return 200;
  } catch (err) {
    if (err instanceof AccessError) return err.status;
    throw err;
  }
}

describe("requireAccess", () => {
  it("401 without a session", async () => {
    expect(await status(null, AN)).toBe(401);
  });

  it("404 for a signed-in user who is not an english member (Launcher-only)", async () => {
    expect(await status("launcherOnly", AN)).toBe(404);
  });

  it("404 for a malformed or unknown learner id", async () => {
    expect(await status("parent", "not-a-uuid")).toBe(404);
    expect(await status("parent", MISSING)).toBe(404);
  });

  it("tutor of An: An ok, Nguyên 404 (not 403)", async () => {
    expect(await status("tutorAn", AN)).toBe(200);
    expect(await status("tutorAn", NGUYEN)).toBe(404);
  });

  it("tutor of Nguyên: Nguyên ok, An 404", async () => {
    expect(await status("tutorNguyen", NGUYEN)).toBe(200);
    expect(await status("tutorNguyen", AN)).toBe(404);
  });

  it("expired or not-yet-valid relationship → 404 (FR-01b)", async () => {
    expect(await status("tutorExpired", AN)).toBe(404);
    expect(await status("tutorFuture", AN)).toBe(404);
  });

  it("student: own learner ok, the other learner 404", async () => {
    expect(await status("studentAn", AN)).toBe(200);
    expect(await status("studentAn", NGUYEN)).toBe(404);
    expect(await status("studentNguyen", AN)).toBe(404);
  });

  it("parent: both children ok, another family 404", async () => {
    expect(await status("parent", AN)).toBe(200);
    expect(await status("parent", NGUYEN)).toBe(200);
    expect(await status("parent", FOREIGN)).toBe(404);
    expect(await status("otherParent", AN)).toBe(404);
  });

  it("ALLOW_REAL_LEARNERS=false hides real learners even from people in scope", async () => {
    expect(await status("parent", REAL, "learner:read", false)).toBe(404);
    expect(await status("tutorAn", REAL, "learner:read", false)).toBe(404);
    expect(await status("parent", REAL, "learner:read", true)).toBe(200);
    expect(await status("tutorAn", REAL, "learner:read", true)).toBe(200);
  });

  it("in scope but action not allowed for the role → 403", async () => {
    expect(await status("tutorAn", AN, "admin")).toBe(403);
    expect(await status("tutorAn", AN, "consent:read")).toBe(403);
    expect(await status("studentAn", AN, "work:review")).toBe(403);
    expect(await status("studentAn", AN, "consent:read")).toBe(403);
    expect(await status("parent", AN, "work:submit")).toBe(403);
  });

  it("out of scope wins over action: never 403 for someone else's learner", async () => {
    expect(await status("tutorAn", NGUYEN, "admin")).toBe(404);
    expect(await status("studentAn", NGUYEN, "work:submit")).toBe(404);
  });

  it("allowed actions per role", async () => {
    expect(await status("studentAn", AN, "work:submit")).toBe(200);
    expect(await status("tutorAn", AN, "work:review")).toBe(200);
    expect(await status("parent", AN, "admin")).toBe(200);
    expect(await status("parent", NGUYEN, "consent:read")).toBe(200);
  });

  it("inquiry actions: parent and tutor in scope ok, student 403, out of scope 404 (S2)", async () => {
    for (const action of ["inquiries:read", "inquiries:assign", "activities:event"] as const) {
      expect(await status("parent", AN, action)).toBe(200);
      expect(await status("parent", NGUYEN, action)).toBe(200);
      expect(await status("tutorAn", AN, action)).toBe(200);
      expect(await status("tutorAn", NGUYEN, action)).toBe(404);
      expect(await status("tutorExpired", AN, action)).toBe(404);
      expect(await status("studentAn", AN, action)).toBe(403);
      expect(await status("studentAn", NGUYEN, action)).toBe(404);
      expect(await status("otherParent", AN, action)).toBe(404);
      expect(await status(null, AN, action)).toBe(401);
    }
  });

  it("returns the member and learner on success", async () => {
    const grant = await requireAccess({ id: "u-tutorAn" }, AN, "learner:read", deps);
    expect(grant.member.role).toBe("tutor");
    expect(grant.learner.id).toBe(AN);
  });
});
