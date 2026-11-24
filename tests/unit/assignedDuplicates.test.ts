import { describe, expect, it } from "vitest";
import { isDuplicate, normTitle, openTitles } from "@/lib/assigned/duplicates";
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
