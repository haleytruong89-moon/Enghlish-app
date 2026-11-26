import { describe, expect, it } from "vitest";
import { pendingCopy, reviewPage, revisionReviewCopy } from "@/lib/copy/vi";
import type { CurriculumCard } from "@/lib/curriculum/shape";
import { buildPendingRows, countGroups, filterRows, parseGroup, pendingView, type PendingInput } from "@/lib/desk/pending";
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

describe("Chờ duyệt — unfinished imports (W3)", () => {
  const imp = (status: "reading" | "draft" | "ai_failed", over: Record<string, unknown> = {}) => ({ id: `m-${status}`, learnerId: L, title: "Progress Test", status, takenOn: "2026-10-23", updatedAt: "2026-11-05T03:00:00Z", canConfirm: true, ...over });
  it("reading, draft and ai_failed imports of THIS child are link-only rows to /imports/<id>; other children's are left out", () => {
    const rows = buildPendingRows(input({ work: [], studio: [], skills: [], drafts: [], curricula: [], imports: [imp("reading"), imp("draft"), imp("ai_failed"), imp("draft", { id: "x", learnerId: O })] }));
    expect(rows.map((r) => [r.key, r.href, r.kind])).toEqual([
      ["import-m-reading", "/imports/m-reading", "import"], ["import-m-draft", "/imports/m-draft", "import"], ["import-m-ai_failed", "/imports/m-ai_failed", "import"],
    ].sort((a, b) => a[0]!.localeCompare(b[0]!)));
    expect(rows.every((r) => r.group === "check" && r.label === pendingCopy.kinds.import)).toBe(true);
  });
  it("a parent sees a draft as waiting for the tutor (only the tutor confirms, R8)", () => {
    const rows = buildPendingRows(input({ role: "parent", work: [], studio: [], skills: [], drafts: [], curricula: [], imports: [imp("draft"), imp("ai_failed")] }));
    expect(Object.fromEntries(rows.map((r) => [r.key, r.waitingTutor]))).toEqual({ "import-m-draft": true, "import-m-ai_failed": false });
  });
});

describe("Chờ duyệt — roadmap (W4a)", () => {
  const only = (over: Partial<PendingInput>) => input({ work: [], studio: [], skills: [], drafts: [], curricula: [], ...over });
  it("draft milestones are ONE link-only row to the roadmap page, in its own group", () => {
    const rows = buildPendingRows(only({ roadmapDrafts: 3 }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "roadmap-waiting", kind: "milestone", group: "roadmap", href: `/learners/${L}/roadmap`, title: pendingCopy.need.milestone(3), label: pendingCopy.kinds.milestone, waitingTutor: false });
    expect(countGroups(rows).roadmap).toBe(1);
    expect(filterRows(rows, "roadmap")).toHaveLength(1);
    expect(parseGroup("roadmap")).toBe("roadmap");
  });
  it("nothing waiting (0 or not given) = no row; a parent sees it as waiting for the tutor", () => {
    expect(buildPendingRows(only({ roadmapDrafts: 0 }))).toEqual([]);
    expect(buildPendingRows(only({}))).toEqual([]);
    expect(buildPendingRows(only({ role: "parent", roadmapDrafts: 2 }))[0]?.waitingTutor).toBe(true);
  });
});

describe("Chờ duyệt rows", () => {
  it("one row per waiting item of THIS child, oldest first, undated last", () => {
    const rows = buildPendingRows(input({ work: [work(), work({ episodeId: "e9", learnerId: O })], studio: [studio(), studio({ attemptId: "s9", learnerId: O })] }));
    expect(rows.map((r) => r.key)).toEqual(["studio-s1", "work-e1", "skill-k1", "skill-k2", "draft-d1", "curriculum-v1"]);
    expect(rows.every((r) => !r.key.endsWith("9"))).toBe(true);
  });
  it("every row opens an existing detail page (no decision in the table)", () => {
    const byKey = Object.fromEntries(buildPendingRows(input()).map((r) => [r.key, r.href]));
    expect(byKey).toEqual({
      "studio-s1": `/learners/${L}/finish/s1`, // L1: one screen per submission
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
    expect(r("draft-d1")).toMatchObject({ group: "drafts", need: pendingCopy.need.studioDraft });
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
    // Q1 (audit 25/11): drafts have their own tab and are not in "Tất cả" / the count.
    expect(countGroups(rows)).toEqual({ all: 5, work: 1, check: 1, ai: 1, skills: 2, roadmap: 0, goals: 0, drafts: 1 });
    expect(filterRows(rows, "ai").map((r) => r.kind)).toEqual(["curriculum_draft"]);
    expect(filterRows(rows, "drafts").map((r) => r.kind)).toEqual(["studio_draft"]);
    expect(filterRows(rows, "all")).toHaveLength(5);
    expect(filterRows(rows, "all").some((r) => r.group === "drafts")).toBe(false);
    expect(parseGroup("skills")).toBe("skills");
    expect(parseGroup(["ai", "work"])).toBe("ai");
    expect(parseGroup("bogus")).toBe("all");
    expect(parseGroup(undefined)).toBe("all");
  });
});

describe("pendingView: what a Chờ duyệt surface may claim", () => {
  it("complete and healthy: exact count; empty text allowed when complete and healthy", () => {
    expect(pendingView({ rows: [], failed: [], more: false })).toMatchObject({ count: "0", showEmpty: true, showMore: false, partial: false });
    expect(pendingView({ rows: [{ group: "work" }, { group: "check" }], failed: [], more: false }).count).toBe("2");
  });
  it("page limit reached: '≥ n', never the empty text, shows the 'more' note", () => {
    expect(pendingView({ rows: [], failed: [], more: true })).toMatchObject({ count: "≥ 0", showEmpty: false, showMore: true, partial: true });
    expect(pendingView({ rows: [{ group: "work" }], failed: [], more: true }).count).toBe("≥ 1");
  });
  it("a failed source: unknown count and never the empty text", () => {
    expect(pendingView({ rows: [], failed: ["studio"], more: false })).toMatchObject({ count: null, showEmpty: false, partial: true });
  });
});

describe("Chờ duyệt — the child's retries (W4c2)", () => {
  const retry = (over: Record<string, unknown> = {}) => ({
    attemptId: "t1", learnerId: L, alias: "An (thử)", isTest: true, activityId: "act", title: "Unit 5 test", submittedAt: "2026-11-01T03:00:00Z", since: "2026-11-02T03:00:00Z",
    retries: [{ itemId: "q2", n: 2, stem: "x", given: "a", retry: "b", kind: "retry", at: "2026-11-02T03:00:00Z" }, { itemId: "q6", n: 6, stem: "y", given: "", retry: null, kind: "revealed", at: "2026-11-02T03:01:00Z" }], ...over,
  });
  it("is one link-only row per attempt of THIS child, in the 'check' group, saying how many questions", () => {
    const rows = buildPendingRows(input({ work: [], studio: [], skills: [], drafts: [], curricula: [], retries: [retry(), retry({ attemptId: "t2", learnerId: O })] as never }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "retry-t1", kind: "retry", group: "check", label: pendingCopy.kinds.retry, need: `${pendingCopy.need.retry(1)} · ${pendingCopy.need.reveal(1)}`, href: `/learners/${L}/finish/t1`, waitingTutor: false });
    expect(pendingCopy.need.retry(2)).toBe("Con thử lại 2 câu");
    expect(pendingCopy.need.reveal(1)).toBe("Con xem đáp án 1 câu");
  });
});

describe("Q1 (audit 25/11): drafts do not count", () => {
  it("the number beside Chờ duyệt leaves out the drafts tab", () => {
    expect(pendingView({ rows: [{ group: "drafts" }, { group: "drafts" }, { group: "work" }], failed: [], more: false }).count).toBe("1");
    expect(pendingView({ rows: [{ group: "drafts" }], failed: [], more: false })).toMatchObject({ count: "0", showEmpty: true });
    expect(parseGroup("drafts")).toBe("drafts");
  });
});

describe("L1: a submission with a Studio part opens 'Xong một bài'", () => {
  it("skills to score + no feedback (no question to check) still open the finish screen, not the old review page", () => {
    const rows = buildPendingRows(input({ work: [work({ attemptId: "s1" })], studio: [], skills: [], drafts: [], curricula: [], feedback: [{ attemptId: "s1", title: "Unit 5 test", since: "2026-11-01T03:00:00Z", href: `/learners/${L}/finish/s1` }] }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "attempt-s1", href: `/learners/${L}/finish/s1` });
  });
});

describe("Q2 (audit 25/11): one row per submission", () => {
  const fb = (over: Record<string, unknown> = {}) => ({ attemptId: "s1", title: "Unit 5 test", since: "2026-11-01T03:00:00Z", href: "/review/e1", ...over });
  const retry = { attemptId: "s1", learnerId: L, alias: "An (thử)", isTest: true, activityId: "act", title: "Unit 5 test", submittedAt: "2026-11-01T03:00:00Z", since: "2026-11-02T03:00:00Z", retries: [{ itemId: "q2", n: 2, stem: "x", given: "a", retry: "b", kind: "retry", at: "2026-11-02T03:00:00Z" }] };
  it("questions to check + skills to score + retry + no feedback of ONE attempt become one 'Bài nộp' row opening the first part", () => {
    const rows = buildPendingRows(input({ work: [work({ attemptId: "s1", titleVi: "Unit 5 test", submittedAt: "2026-11-01T03:05:00Z" })], studio: [studio()], retries: [retry] as never, skills: [], drafts: [], curricula: [], feedback: [fb()] }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: "attempt-s1", group: "check", label: pendingCopy.kinds.work, title: "Unit 5 test", since: "2026-11-01T03:00:00Z",
      need: `${pendingCopy.need.studioCheck(1)} · đã chấm 0/2 kỹ năng · con thử lại 1 câu · chưa góp ý`,
      href: `/learners/${L}/finish/s1`, waitingTutor: false,
    });
  });
  it("every piece after the first starts lower-case, even inside a part ('con thử lại … · con xem đáp án …')", () => {
    const two = { ...retry, retries: [...retry.retries, { itemId: "q6", n: 6, stem: "y", given: "", retry: null, kind: "revealed", at: "2026-11-02T03:01:00Z" }] };
    const rows = buildPendingRows(input({ work: [], studio: [studio()], retries: [two] as never, skills: [], drafts: [], curricula: [] }));
    expect(rows[0]?.need).toBe(`${pendingCopy.need.studioCheck(1)} · con thử lại 1 câu · con xem đáp án 1 câu`);
  });
  it("feedback alone is its own row; different attempts are never merged", () => {
    const rows = buildPendingRows(input({ work: [work()], studio: [], skills: [], drafts: [], curricula: [], feedback: [fb({ attemptId: "s7", href: "/review/e7" })] }));
    expect(rows.map((r) => [r.key, r.need, r.href])).toEqual([["feedback-s7", pendingCopy.need.feedback, "/review/e7"], ["work-e1", reviewPage.progress(0, 2), "/review/e1"]]);
  });
  it("a merged row stays in the group of its first part ('Cần xem câu' keeps open questions); work + feedback stays 'Bài nộp'", () => {
    const rows = buildPendingRows(input({ work: [work({ attemptId: "s1" })], studio: [studio()], skills: [], drafts: [], curricula: [], feedback: [fb()] }));
    expect(filterRows(rows, "check").map((r) => r.key)).toEqual(["attempt-s1"]);
    const only = buildPendingRows(input({ work: [work({ attemptId: "s1" })], studio: [], skills: [], drafts: [], curricula: [], feedback: [fb()] }));
    expect(only.map((r) => [r.key, r.group])).toEqual([["attempt-s1", "work"]]);
  });
  it("parent: a merged row shows 'waits for the tutor' when any part does (the skill scoring), even if feedback is hers to give", () => {
    const rows = buildPendingRows(input({ role: "parent", work: [work({ attemptId: "s1", canDecide: false })], studio: [], skills: [], drafts: [], curricula: [], feedback: [fb()] }));
    expect(rows[0]).toMatchObject({ key: "attempt-s1", waitingTutor: true });
  });
  it("a failing drafts source does not make the count unknown (drafts never count)", () => {
    expect(pendingView({ rows: [{ group: "work" }], failed: ["drafts"], more: false }).count).toBe("1");
    expect(pendingView({ rows: [{ group: "work" }], failed: ["drafts", "studio"], more: false }).count).toBe(null);
  });
});

