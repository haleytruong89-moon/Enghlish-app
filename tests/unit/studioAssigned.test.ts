import { describe, expect, it } from "vitest";
import { buildStudioAssigned, currentStudioResults, isStudioTemplateId, studioOverdueCount } from "@/lib/studio/assigned";
import type { InquiryView } from "@/lib/inquiries/view";

const inq = (id: string, templateId: string, start: string | null, due: string, act = `a-${id}`, assignedAt = "2026-11-20T01:00:00Z"): InquiryView => ({
  id, templateId, templateVersion: 1, titleVi: `Bài ${id}`, bigQuestionEn: "", bigQuestionVi: "", week: 0, dateFrom: "", dateTo: "", assignedAt, dueOn: due, sources: [],
  steps: [{ activityId: act, stepNo: 1, activityType: "ACT-SOURCE-QA", mode: "PRACTICE", purpose: [], targetIds: [], timeMin: 10, promptEn: "", itemCount: 12, schedule: { date: start, plannedDate: due, skipped: false, lastReason: null } }],
});

describe("Studio tests assigned to a child: what the adults see", () => {
  const TODAY = "2026-11-21";
  const inquiries = [
    inq("1", "B-ST-000001", "2026-11-25", "2026-11-28"), // not open yet
    inq("2", "B-ST-000002", "2026-11-20", "2026-11-23"), // open, nothing sent
    inq("3", "B-ST-000003", "2026-11-15", "2026-11-20"), // due yesterday, nothing sent
    inq("4", "B-ST-000004", "2026-11-15", "2026-11-25"), // sent, two items wait for the tutor
    inq("5", "B-ST-000005", "2026-11-15", "2026-11-19"), // sent late, checked
    inq("6", "B-W1", "2026-11-15", "2026-11-19"), // a weekly topic: not a Studio test
  ];
  const attempts = [
    { id: "t4", activity_instance_id: "a-4", attempt_no: 1, submitted_at: "2026-11-21T02:00:00Z" },
    { id: "t5a", activity_instance_id: "a-5", attempt_no: 1, submitted_at: "2026-11-20T02:00:00Z" },
    { id: "t5b", activity_instance_id: "a-5", attempt_no: 2, submitted_at: "2026-11-21T03:00:00Z" },
  ];
  const episodes = [{ id: "e4", attempt_id: "t4" }, { id: "e5a", attempt_id: "t5a" }, { id: "e5b", attempt_id: "t5b" }];
  const results = [
    { attempt_id: "t5a", correct: 9, total_items: 12, not_in_app_items: [], attempt: "first" },
    { attempt_id: "t5b", correct: 12, total_items: 12, not_in_app_items: [], attempt: "retry" },
  ];

  it("one row per Studio test, newest first, with a status the adult can act on", () => {
    const rows = buildStudioAssigned(inquiries, attempts, episodes, results, TODAY);
    expect(rows.map((r) => [r.instanceId, r.status])).toEqual([
      ["1", "not_yet"], ["2", "todo"], ["3", "overdue"], ["4", "waiting"], ["5", "checked"],
    ]);
    const by = Object.fromEntries(rows.map((r) => [r.instanceId, r]));
    expect(by["4"]).toMatchObject({ attempts: 1, lastAttemptId: "t4", episodeId: "e4", firstResult: null });
    // the first attempt is the one that counts; the latest decides the status
    expect(by["5"]).toMatchObject({ attempts: 2, lastAttemptId: "t5b", episodeId: "e5b", firstResult: { correct: 9, total: 12 }, items: 12 });
    expect(by["2"]).toMatchObject({ startOn: "2026-11-20", dueOn: "2026-11-23", episodeId: null });
    expect(rows.some((r) => r.instanceId === "6")).toBe(false);
  });

  it("only overdue tests with nothing sent are counted for the desk", () => {
    expect(studioOverdueCount(buildStudioAssigned(inquiries, attempts, episodes, results, TODAY))).toBe(1);
    expect(studioOverdueCount(buildStudioAssigned(inquiries, attempts, episodes, results, "2026-11-19"))).toBe(0);
  });

  it("a skipped test is not overdue and not counted for the desk", () => {
    const skipped = inq("7", "B-ST-000007", "2026-11-10", "2026-11-12");
    skipped.steps[0]!.schedule.skipped = true;
    const rows = buildStudioAssigned([skipped], [], [], [], TODAY);
    expect(rows[0]!.status).toBe("skipped");
    expect(studioOverdueCount(rows)).toBe(0);
  });

  it("x/y leaves out paper-only questions; a first result recorded as a retry (same test given again) is not shown as the first", () => {
    const one = [inq("8", "B-ST-000008", "2026-11-15", "2026-11-25")];
    const tries = [{ id: "t8", activity_instance_id: "a-8", attempt_no: 1, submitted_at: "2026-11-21T02:00:00Z" }];
    const paper = buildStudioAssigned(one, tries, [], [{ attempt_id: "t8", correct: 9, total_items: 15, not_in_app_items: [13, 14, 15], attempt: "first" }], TODAY);
    expect(paper[0]!.firstResult).toEqual({ correct: 9, total: 12 });
    const again = buildStudioAssigned(one, tries, [], [{ attempt_id: "t8", correct: 9, total_items: 12, not_in_app_items: [], attempt: "retry" }], TODAY);
    expect(again[0]).toMatchObject({ status: "checked", firstResult: null });
  });

  it("a correction of a Studio result (no attempt id) replaces its counts", () => {
    const rows = currentStudioResults([
      { id: "r1", attempt_id: "t1", correct: 7, total_items: 12, not_in_app_items: [], attempt: "first", supersedes_id: null },
      { id: "r2", attempt_id: null, correct: 9, total_items: 12, not_in_app_items: [], attempt: "first", supersedes_id: "r1" },
      { id: "r3", attempt_id: null, correct: 10, total_items: 12, not_in_app_items: [], attempt: "first", supersedes_id: "r2" },
      { id: "q1", attempt_id: null, correct: 3, total_items: 5, not_in_app_items: [], attempt: "first", supersedes_id: null },
    ]);
    expect(rows).toEqual([{ attempt_id: "t1", correct: 10, total_items: 12, not_in_app_items: [], attempt: "first" }]);
  });

  it("Studio template ids", () => {
    expect(isStudioTemplateId("B-ST-000123")).toBe(true);
    expect(isStudioTemplateId("A-ST-000001")).toBe(true);
    expect(isStudioTemplateId("B-IM-000001")).toBe(false);
    expect(isStudioTemplateId("B-W1")).toBe(false);
  });
});
