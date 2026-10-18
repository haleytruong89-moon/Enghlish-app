import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PurgeForm } from "@/components/admin/PurgeForm";
import type { AccessStore, Learner, Member } from "@/lib/auth/requireAccess";
import { purgePage } from "@/lib/copy/vi";
import { handlePurgeLearner, type PurgeDeps, type PurgeStore } from "@/lib/purge/handlers";
import { nameMatches, normalizeName } from "@/lib/purge/name";
import { purgeBodySchema } from "@/lib/purge/schemas";
import { parsePurgePreview } from "@/lib/purge/shape";
import { ReviewDbError } from "@/lib/review/handlers";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const OTHER_FAMILY = "f0000000-0000-4000-8000-000000000002";
const TEST_CHILD = "a0000000-0000-4000-8000-000000000001";
const REAL_CHILD = "c0000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-18T08:00:00Z");

const mk = (id: string, role: Member["role"], familyId = FAMILY): Member => ({ id: `m-${id}`, userId: `u-${id}`, familyId, role, displayName: id });
const members = [mk("parent", "parent"), mk("tutor", "tutor"), mk("student", "student"), mk("otherParent", "parent", OTHER_FAMILY)];
const learners: Learner[] = [
  { id: TEST_CHILD, familyId: FAMILY, memberId: "m-student", alias: "An (thử)", trackId: "A", isTest: true, status: "active" },
  { id: REAL_CHILD, familyId: FAMILY, memberId: null, alias: "Đăng An", trackId: "A", isTest: false, status: "active" },
];
const access: AccessStore = {
  getMemberByUserId: async (u) => members.find((m) => m.userId === u) ?? null,
  getLearner: async (id) => learners.find((l) => l.id === id) ?? null,
  getRelationships: async (memberId, learnerId) =>
    memberId === "m-tutor" ? [{ memberId, learnerId, relation: "tutor", validFrom: new Date("2026-01-01"), validTo: null }] : [],
};

function makeStore(over: Partial<PurgeStore> = {}) {
  return {
    purge: vi.fn(async () => ({ deleted: { results: 2, learners: 1 } })),
    removeFiles: vi.fn(async () => 3),
    auditFiles: vi.fn(async () => undefined),
    ...over,
  } satisfies PurgeStore;
}
const deps = (user: string | null, store: PurgeStore, allowReal = true): PurgeDeps => ({
  user: user ? { id: `u-${user}` } : null,
  store,
  access: { store: access, allowRealLearners: allowReal, now: NOW },
});
const untouched = (s: ReturnType<typeof makeStore>) => [s.purge, s.removeFiles, s.auditFiles].every((f) => vi.mocked(f).mock.calls.length === 0);

describe("name check", () => {
  it("ignores case, spacing and how accents are stored, but not the letters", () => {
    expect(normalizeName("  Đăng   AN ")).toBe("đăng an");
    expect(nameMatches("đăng an", "Đăng An")).toBe(true);
    expect(nameMatches("D\u0103ng An", "Đăng An")).toBe(false); // Đ is not D
    expect(nameMatches("A\u0306n", "Ăn")).toBe(true); // decomposed accent still matches
    expect(nameMatches("An (thu)", "An (thử)")).toBe(false);
    expect(nameMatches("", "")).toBe(false); // an empty name never matches
  });
  it("the body is strict", () => {
    expect(purgeBodySchema.safeParse({ confirm_name: "x" }).success).toBe(true);
    expect(purgeBodySchema.safeParse({ confirm_name: "" }).success).toBe(false);
    expect(purgeBodySchema.safeParse({ confirm_name: "x", confirm_real: "yes" }).success).toBe(false);
    expect(purgeBodySchema.safeParse({ confirm_name: "x", extra: 1 }).success).toBe(false);
  });
});

describe("POST purge (handler)", () => {
  it("only a parent of the family: no session 401; outsiders 404; a tutor or the student 403 - and nothing is deleted", async () => {
    for (const [who, status] of [[null, 401], ["otherParent", 404], ["tutor", 403], ["student", 403]] as const) {
      const s = makeStore();
      const r = await handlePurgeLearner(deps(who, s), TEST_CHILD, { confirm_name: "An (thử)" });
      expect(r.status, String(who)).toBe(status);
      expect(untouched(s)).toBe(true);
    }
    const s = makeStore();
    expect((await handlePurgeLearner(deps("parent", s), "not-a-uuid", { confirm_name: "x" })).status).toBe(404);
    expect(untouched(s)).toBe(true);
  });

  it("a real child is invisible while ALLOW_REAL_LEARNERS is false (preview deployments)", async () => {
    const s = makeStore();
    expect((await handlePurgeLearner(deps("parent", s, false), REAL_CHILD, { confirm_name: "Đăng An", confirm_real: true })).status).toBe(404);
    expect(untouched(s)).toBe(true);
  });

  it("the typed name must match; a bad body is 400; nothing is deleted on either", async () => {
    const s = makeStore();
    const wrong = await handlePurgeLearner(deps("parent", s), TEST_CHILD, { confirm_name: "Nguyên" });
    expect(wrong.status).toBe(400);
    expect((wrong.body as { error: string }).error).toBe("name_mismatch");
    expect((await handlePurgeLearner(deps("parent", s), TEST_CHILD, { confirm_name: "" })).status).toBe(400);
    expect((await handlePurgeLearner(deps("parent", s), TEST_CHILD, undefined)).status).toBe(400);
    expect(untouched(s)).toBe(true);
  });

  it("a test child needs only the name; the actor is the signed-in parent; files are removed and audited after the purge", async () => {
    const s = makeStore();
    const r = await handlePurgeLearner(deps("parent", s), TEST_CHILD, { confirm_name: " an (THỬ) " });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ deleted: { results: 2, learners: 1 }, files_removed: 3, files_ok: true });
    expect(s.purge).toHaveBeenCalledWith({ learnerId: TEST_CHILD, actorUserId: "u-parent" });
    expect(s.removeFiles).toHaveBeenCalledWith({ familyId: FAMILY, learnerId: TEST_CHILD });
    expect(s.auditFiles).toHaveBeenCalledWith({ familyId: FAMILY, learnerId: TEST_CHILD, actorUserId: "u-parent", removed: 3 });
    expect(vi.mocked(s.purge).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(s.removeFiles).mock.invocationCallOrder[0] as number);
  });

  it("a real child needs the second confirmation as well", async () => {
    const s = makeStore();
    const r1 = await handlePurgeLearner(deps("parent", s), REAL_CHILD, { confirm_name: "Đăng An" });
    expect(r1.status).toBe(400);
    expect((r1.body as { error: string }).error).toBe("real_needs_confirmation");
    expect((await handlePurgeLearner(deps("parent", s), REAL_CHILD, { confirm_name: "Đăng An", confirm_real: false })).status).toBe(400);
    expect(untouched(s)).toBe(true);
    expect((await handlePurgeLearner(deps("parent", s), REAL_CHILD, { confirm_name: "Đăng An", confirm_real: true })).status).toBe(200);
    expect(s.purge).toHaveBeenCalledTimes(1);
  });

  it("if the stored files cannot be removed the rows are still gone: 200 with files_ok false, so the screen explains the cleanup", async () => {
    const s = makeStore({ removeFiles: vi.fn(async () => { throw new Error("storage down"); }) });
    const r = await handlePurgeLearner(deps("parent", s), TEST_CHILD, { confirm_name: "An (thử)" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ files_removed: null, files_ok: false });
    expect(s.auditFiles).not.toHaveBeenCalled();
  });

  it("a database refusal is an answer, not a crash; an unknown failure is rethrown (500, logged)", async () => {
    const refused = makeStore({ purge: vi.fn(async () => { throw new ReviewDbError("P0002", "learner not found"); }) });
    expect((await handlePurgeLearner(deps("parent", refused), TEST_CHILD, { confirm_name: "An (thử)" })).status).toBe(404);
    expect(refused.removeFiles).not.toHaveBeenCalled(); // files are only touched after the rows are gone
    const broken = makeStore({ purge: vi.fn(async () => { throw new Error("boom"); }) });
    await expect(handlePurgeLearner(deps("parent", broken), TEST_CHILD, { confirm_name: "An (thử)" })).rejects.toThrow("boom");
  });
});

describe("the dry run and the screen", () => {
  it("parses what the database returns and drops anything else", () => {
    const p = parsePurgePreview({ learner_id: "x", alias: "An", is_test: true, counts: { results: 2, learners: 1 }, extra: "dropped" });
    expect(p).toEqual({ alias: "An", isTest: true, counts: { results: 2, learners: 1 } });
    expect(() => parsePurgePreview({ alias: "An" })).toThrow();
  });

  const counts = { results: 2, files: 4, learners: 1, audit_log: 9, members: 1, lesson_notes: 0 };
  it("a test child: the numbers, the name box, no second confirmation, the button waits for the name", () => {
    const html = renderToStaticMarkup(createElement(PurgeForm, { learnerId: TEST_CHILD, alias: "An (thử)", isTest: true, counts }));
    expect(html).toContain('data-testid="purge-count-results"');
    expect(html).toContain(purgePage.countLine(purgePage.countLabels.results ?? "", 2));
    expect(html).toContain(purgePage.countLine(purgePage.countLabels.files ?? "", 4));
    expect(html).not.toContain('data-testid="purge-count-lesson_notes"'); // zero rows are not listed
    expect(html).not.toContain('data-testid="purge-count-learners"');
    expect(html).toContain(purgePage.nameLabel("An (thử)"));
    expect(html).not.toContain('data-testid="purge-real"');
    expect(html).toMatch(/<button[^>]*data-testid="purge-submit"[^>]*disabled/);
  });
  it("a real child also shows the second confirmation", () => {
    const html = renderToStaticMarkup(createElement(PurgeForm, { learnerId: REAL_CHILD, alias: "Đăng An", isTest: false, counts }));
    expect(html).toContain('data-testid="purge-real"');
    expect(html).toContain(purgePage.realConfirm);
  });
  it("every row the dry run can report has a Vietnamese label", () => {
    for (const key of [
      "audit_log", "target_sets", "inquiry_instances", "activity_instances", "instance_item_keys", "activity_instance_events", "consents", "relationships",
      "attempt_auto_checks", "episodes", "exposure_log", "assistance_events", "artifact_versions", "attempts", "working_drafts", "validation_decisions",
      "observations", "lesson_notes", "tag_marks", "recheck_events", "results", "submissions", "assignment_events", "assignments", "files", "upload_tickets",
      "login_names", "learners", "members",
    ]) expect(purgePage.countLabels[key], key).toBeTruthy();
  });
});
