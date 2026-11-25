import { describe, expect, it } from "vitest";
import { isDuplicate, likelyDuplicates, normTitle, openTitles, overdueFacts } from "@/lib/assigned/duplicates";
import type { StudioAssignedRow } from "@/lib/studio/assigned";
import type { AssignmentView } from "@/lib/practice/types";

const st = (title: string, status: StudioAssignedRow["status"]) => ({ title, status, feedbackReady: true, feedbackGiven: false }) as StudioAssignedRow;
const pr = (title: string, o: Partial<AssignmentView> = {}) => ({ title, retractedAt: null, submission: null, resultId: null, feedback: [], ...o }) as AssignmentView;

describe("same work given twice", () => {
  it("normTitle ignores case, spaces and the separators people type differently", () => {
    expect(normTitle("  Destination C1,  C2 - Unit 15 ")).toBe(normTitle("destination c1 c2 · unit 15"));
    expect(normTitle("Unit 14 · Idioms (L)")).toBe("unit 14 idioms (l)");
  });
  it("only work the child has not sent and that was not removed counts as open", () => {
    const open = openTitles([st("Unit 14 · Idioms (L)", "overdue"), st("Review 1", "checked"), st("Old", "skipped")], [pr("Link A"), pr("Link B", { retractedAt: "x" })]);
    expect(isDuplicate("unit 14 · idioms (l)", open)).toBe(true);
    expect(isDuplicate("Review 1", open)).toBe(false);
    expect(isDuplicate("Old", open)).toBe(false);
    expect(isDuplicate("Link A", open)).toBe(true);
    expect(isDuplicate("Link B", open)).toBe(false);
    expect(isDuplicate("   ", open)).toBe(false);
    expect(openTitles(null, [])).toEqual([]);
  });
});

describe("Q6 (audit 25/11): overdue tests that look given by mistake", () => {
  // The case seen on 25/11: two identical tests overdue 8 days, and an overdue test with the same title as one the child already sent.
  const row = (instanceId: string, title: string, status: StudioAssignedRow["status"], o: Partial<StudioAssignedRow> = {}) =>
    ({ instanceId, title, status, attempts: 0, assignedAt: "2026-11-15T00:00:00Z", lateDays: status === "overdue" ? 3 : null, ...o }) as StudioAssignedRow;
  const rows = [
    row("a", "Destination C1 C2", "overdue", { lateDays: 8, assignedAt: "2026-11-15T01:00:00Z" }),
    row("b", "Destination C1 C2", "overdue", { lateDays: 8, assignedAt: "2026-11-15T02:00:00Z" }),
    row("c", "Destination C1&C2 · Unit 14 · Idioms (L)", "overdue", { assignedAt: "2026-11-20T00:00:00Z" }),
    row("d", "Destination C1&C2 · Unit 14 · Idioms (L)", "checked", { attempts: 1, assignedAt: "2026-11-20T00:00:00Z" }),
    row("e", "Unit 15", "overdue"),
    row("f", "Unit 15", "skipped", { attempts: 0, assignedAt: "2026-11-01T00:00:00Z" }),
  ];
  it("marks the later of two identical open tests and a test whose twin was sent; a removed twin does not count", () => {
    expect([...likelyDuplicates(rows)].sort()).toEqual(["b", "c"]);
  });
  it("same assignment time: only one of the two is marked", () => {
    expect(likelyDuplicates([row("x", "T", "overdue"), row("y", "T", "overdue")]).size).toBe(1);
  });
  it("overdueFacts: count, look-alikes, and tests more than 7 days late", () => {
    expect(overdueFacts(rows)).toEqual({ overdue: 4, duplicates: 2, longLate: 2 });
    expect(overdueFacts([])).toEqual({ overdue: 0, duplicates: 0, longLate: 0 });
  });
});
