import { describe, expect, it } from "vitest";
import { buildBoard, parseTab, tabOfPractice, tabOfStudio } from "@/lib/assigned/board";
import type { StudioAssignedRow } from "@/lib/studio/assigned";
import type { AssignmentView, SubmissionFeedbackView, SubmissionView } from "@/lib/practice/types";

const TODAY = "2026-11-24";
const st = (id: string, o: Partial<StudioAssignedRow>): StudioAssignedRow => ({
  instanceId: id, activityId: `a-${id}`, title: `Bài ${id}`, items: 10, startOn: "2026-11-15", dueOn: "2026-11-30", assignedAt: "2026-11-15T01:00:00Z",
  status: "todo", lateDays: null, removedReason: null, attempts: 0, lastAttemptId: null, lastSubmittedAt: null, episodeId: null,
  feedbackGiven: false, feedbackReady: true, units: [], firstResult: null, ...o,
});
const pr = (id: string, o: Partial<AssignmentView>): AssignmentView => ({
  id, kind: "link", title: `Link ${id}`, url: "https://example.com", sourceKey: null, tagKeys: [], units: [], unitItems: [], dueOn: "2026-11-30",
  frameId: null, createdAt: "2026-11-15T01:00:00Z", retractedAt: null, file: null, answerFile: null, submission: null, resultId: null, feedback: [], ...o,
});
const sent: SubmissionView = { id: "s1", createdAt: "2026-11-20T01:00:00Z", attempt: "first", usedHint: false, linkUrl: null, byRole: "student", files: [] };
const fb = (live: boolean): SubmissionFeedbackView => ({
  id: "f1", submissionId: "s1", assignmentId: "x", praise: "Tốt", items: [], authorMember: "m", authorRole: "tutor", authorName: null, createdAt: "2026-11-21T01:00:00Z", live,
});

describe("Bài đã giao: which tab a piece of work is in", () => {
  it("Studio: not sent → doing; waiting → need; checked without feedback → need; with feedback → done; removed → removed", () => {
    expect((["not_yet", "todo", "overdue"] as const).map((s) => tabOfStudio(st("1", { status: s })))).toEqual(["doing", "doing", "doing"]);
    expect(tabOfStudio(st("1", { status: "waiting", lastAttemptId: "t" }))).toBe("need");
    expect(tabOfStudio(st("1", { status: "checked", lastAttemptId: "t", feedbackGiven: false }))).toBe("need");
    expect(tabOfStudio(st("1", { status: "checked", lastAttemptId: "t", feedbackGiven: true }))).toBe("done");
    // before 0037 nobody can give feedback: checked is done
    expect(tabOfStudio(st("1", { status: "checked", lastAttemptId: "t", feedbackReady: false }))).toBe("done");
    expect(tabOfStudio(st("1", { status: "skipped" }))).toBe("removed");
  });

  it("link / PDF: nothing sent → doing; sent without result or live feedback → need; result + live feedback, or result with nothing sent → done; retracted → removed", () => {
    expect(tabOfPractice(pr("1", {}))).toBe("doing");
    expect(tabOfPractice(pr("1", { submission: sent }))).toBe("need");
    expect(tabOfPractice(pr("1", { submission: sent, resultId: "r" }))).toBe("need");
    expect(tabOfPractice(pr("1", { submission: sent, resultId: "r", feedback: [fb(false)] }))).toBe("need");
    expect(tabOfPractice(pr("1", { submission: sent, resultId: "r", feedback: [fb(true)] }))).toBe("done");
    expect(tabOfPractice(pr("1", { resultId: "r" }))).toBe("done");
    expect(tabOfPractice(pr("1", { retractedAt: "2026-11-21T01:00:00Z" }))).toBe("removed");
  });

  it("buildBoard: counts over both lists; doing puts the longest-late first; a failed Studio read is reported, not hidden", () => {
    const b = buildBoard(
      [st("1", { status: "overdue", lateDays: 2 }), st("2", { status: "overdue", lateDays: 7 }), st("3", { status: "waiting", lastAttemptId: "t" })],
      [pr("p0", { dueOn: "2026-12-01" }), pr("p1", { dueOn: "2026-11-20" }), pr("p2", { dueOn: "2026-11-10" }), pr("p3", { retractedAt: "2026-11-21T01:00:00Z" })],
      TODAY,
    );
    expect(b.counts).toEqual({ need: 1, doing: 5, done: 0, removed: 1 });
    expect(b.studio.doing.map((r) => r.instanceId)).toEqual(["2", "1"]);
    expect(b.practice.doing.map((a) => a.id)).toEqual(["p2", "p1", "p0"]);
    expect(b.studioFailed).toBe(false);
    expect(buildBoard(null, [], TODAY)).toMatchObject({ studioFailed: true, counts: { need: 0, doing: 0, done: 0, removed: 0 } });
  });

  it("parseTab: a known tab wins; otherwise need when it has work, else doing", () => {
    const counts = { need: 0, doing: 2, done: 1, removed: 0 };
    expect(parseTab("done", counts)).toBe("done");
    expect(parseTab("x", counts)).toBe("doing");
    expect(parseTab(["need"], counts)).toBe("doing");
    expect(parseTab(undefined, { ...counts, need: 1 })).toBe("need");
  });
});
