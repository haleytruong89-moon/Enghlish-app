import { describe, expect, it } from "vitest";
import { pendingCopy, reviewPage, revisionReviewCopy } from "@/lib/copy/vi";
import type { CurriculumCard } from "@/lib/curriculum/shape";
import { buildPendingRows, countGroups, filterRows, parseGroup, type PendingInput } from "@/lib/desk/pending";
import type { InboxItem } from "@/lib/review/types";
import type { SkillInboxItem } from "@/lib/skills/types";
import type { DraftListItem, PendingAttempt } from "@/lib/studio/types";

const L = "a0000000-0000-4000-8000-000000000001";
const O = "b0000000-0000-4000-8000-000000000002";
const work = (over: Partial<InboxItem> = {}): InboxItem => ({
  episodeId: "e1", attemptId: "a1", learnerId: L, alias: "An (thử)", isTest: true, titleVi: "Núi lửa", stepNo: 7, activityType: "ACT-WRITE", mode: "PRACTICE",
  purpose: [], provenance: "in_app", attemptNo: 1, isFirstAttempt: true, submittedAt: "2026-11-02T03:00:00Z", restricted: false, category: "practice",
  targetsTotal: 2, targetsDecided: 0, canDecide: true, revisionRound: null, ...over,
} as InboxItem);
const studio = (over: Partial<PendingAttempt> = {}): PendingAttempt => ({ attemptId: "s1", learnerId: L, alias: "An (thử)", isTest: true, activityId: "act", title: "Unit 5 test", submittedAt: "2026-11-01T03:00:00Z", attemptNo: 1, waitingDays: 3, items: [{ itemId: "i1", n: 4, kind: "gap", stem: "x", expected: "y", accepted: [], given: "z" }], ...over } as PendingAttempt);
const skill = (over: Partial<SkillInboxItem> = {}): SkillInboxItem => ({ id: "k1", kind: "PROPOSED", learnerId: L, alias: "An (thử)", isTest: true, targetKey: "A-L3-CAUSE-S", titleVi: "Nêu nguyên nhân", fromState: "DEVELOPING", toState: "INDEPENDENT", currentState: "DEVELOPING", route: 1, conditions: [], evidence: [], createdAt: "2026-11-03T03:00:00Z", canDecide: true, ...over } as unknown as SkillInboxItem);
const draft = (over: Partial<DraftListItem> = {}): DraftListItem => ({ id: "d1", title: "Destination U5", status: "draft", updatedAt: "2026-11-04T03:00:00Z", templateId: null, templateVersion: null, superseded: false, assigned: 0, ...over } as DraftListItem);
const card = (over: Partial<CurriculumCard> = {}): CurriculumCard => ({ id: "c1", title: "Destination C1&C2", levelNote: null, current: null, progress: null, open: { versionId: "v1", version: 1, status: "draft", errorCode: null }, events: [], ...over } as CurriculumCard);
const input = (over: Partial<PendingInput> = {}): PendingInput => ({ learnerId: L, role: "tutor", work: [work()], studio: [studio()], skills: [skill(), skill({ id: "k2", kind: "FLAG" })], drafts: [draft()], curricula: [card()], ...over });

describe("Chờ duyệt rows", () => {
  it("one row per waiting item of THIS child, oldest first, undated last", () => {
    const rows = buildPendingRows(input({ work: [work(), work({ episodeId: "e9", learnerId: O })], studio: [studio(), studio({ attemptId: "s9", learnerId: O })] }));
    expect(rows.map((r) => r.key)).toEqual(["studio-s1", "work-e1", "skill-k1", "skill-k2", "draft-d1", "curriculum-v1"]);
    expect(rows.every((r) => !r.key.endsWith("9"))).toBe(true);
  });
  it("every row opens an existing detail page (no decision in the table)", () => {
    const byKey = Object.fromEntries(buildPendingRows(input()).map((r) => [r.key, r.href]));
    expect(byKey).toEqual({
      "studio-s1": "/review/studio#studio-s1",
      "work-e1": "/review/e1",
      "skill-k1": "/review/skills#skill-k1",
      "skill-k2": "/review/skills#skill-k2",
      "draft-d1": "/studio/drafts/d1",
      "curriculum-v1": "/curricula/versions/v1",
    });
  });
  it("labels and 'Cần làm'", () => {
    const rows = buildPendingRows(input({ work: [work(), work({ episodeId: "e2", revisionRound: 2, mode: "REVISION" })] }));
    const r = (k: string) => rows.find((x) => x.key === k)!;
    expect(r("work-e1")).toMatchObject({ label: pendingCopy.kinds.work, need: reviewPage.progress(0, 2), group: "work" });
    expect(r("work-e2")).toMatchObject({ label: revisionReviewCopy.inboxLabel(2), need: revisionReviewCopy.inboxProgress });
    expect(r("studio-s1")).toMatchObject({ label: pendingCopy.kinds.studioCheck, need: pendingCopy.need.studioCheck(1), group: "check" });
    expect(r("skill-k2")).toMatchObject({ kind: "flag", label: pendingCopy.kinds.flag, group: "skills" });
    expect(r("draft-d1")).toMatchObject({ group: "ai", need: pendingCopy.need.studioDraft });
    expect(r("curriculum-v1")).toMatchObject({ group: "ai", since: null, need: pendingCopy.need.curriculumDraft });
  });
  it("leaves out what does not wait: superseded / approved / reading drafts, approved curricula", () => {
    const rows = buildPendingRows(input({
      drafts: [draft({ id: "x1", superseded: true }), draft({ id: "x2", status: "approved" }), draft({ id: "x3", status: "extracting" }), draft({ id: "x4", status: "ai_failed" })],
      curricula: [card({ id: "c2", open: null }), card({ id: "c3", open: { versionId: "v3", version: 2, status: "extracting", errorCode: null } })],
    }));
    expect(rows.filter((r) => r.kind === "studio_draft").map((r) => r.key)).toEqual(["draft-x4"]);
    expect(rows.find((r) => r.key === "draft-x4")!.need).toBe(pendingCopy.need.aiFailed);
    expect(rows.some((r) => r.kind === "curriculum_draft")).toBe(false);
  });
  it("parent: in-class work, skill proposals and curriculum approval wait for the tutor", () => {
    const rows = buildPendingRows(input({ role: "parent", work: [work({ canDecide: false })], skills: [skill({ canDecide: false })] }));
    expect(rows.find((r) => r.key === "work-e1")!.waitingTutor).toBe(true);
    expect(rows.find((r) => r.key === "skill-k1")!.waitingTutor).toBe(true);
    expect(rows.find((r) => r.key === "curriculum-v1")!.waitingTutor).toBe(true);
    expect(rows.find((r) => r.key === "draft-d1")!.waitingTutor).toBe(false);
  });
  it("filters, counts, parses the group", () => {
    const rows = buildPendingRows(input());
    expect(countGroups(rows)).toEqual({ all: 6, work: 1, check: 1, ai: 2, skills: 2 });
    expect(filterRows(rows, "ai").map((r) => r.kind)).toEqual(["studio_draft", "curriculum_draft"]);
    expect(filterRows(rows, "all")).toHaveLength(6);
    expect(parseGroup("skills")).toBe("skills");
    expect(parseGroup(["ai", "work"])).toBe("ai");
    expect(parseGroup("bogus")).toBe("all");
    expect(parseGroup(undefined)).toBe("all");
  });
});
