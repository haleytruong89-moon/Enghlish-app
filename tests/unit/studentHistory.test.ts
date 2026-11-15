import { describe, expect, it } from "vitest";
import { filterHistory, hasMessage, historyCounts } from "@/lib/student/history";
import { parseHistory, parseSeen } from "@/lib/student/shape";
import type { HistoryRow, SeenRow } from "@/lib/student/types";

const row = (ref: string, seen: boolean): HistoryRow => ({
  src: "attempt", ref, activityId: ref, assignmentId: null, title: ref, kind: "app", stepNo: 1, activityType: "ACT-SOURCE-QA",
  submittedAt: "2026-11-10T00:00:00Z", first: true, usedHint: null, offline: false, retracted: false, seen,
});

describe("Đã làm filters", () => {
  const rows = [row("a", false), row("b", true), row("c", false)];
  it("all / waiting / seen", () => {
    expect(filterHistory(rows, "all").map((r) => r.ref)).toEqual(["a", "b", "c"]);
    expect(filterHistory(rows, "waiting").map((r) => r.ref)).toEqual(["a", "c"]);
    expect(filterHistory(rows, "seen").map((r) => r.ref)).toEqual(["b"]);
    expect(historyCounts(120, 7)).toEqual({ all: 120, waiting: 7 }); // totals of the whole list, not of the page
    expect(historyCounts(3, 9)).toEqual({ all: 3, waiting: 3 });
  });
});

describe("parsers keep only what the child may see", () => {
  it("history: seen is a flag, never a time, a mark or a result", () => {
    const [h] = parseHistory({ items: [{ src: "submission", ref: "r", assignment_id: "x", title: "Link", kind: "link", submitted_at: "2026-11-10T00:00:00Z", first: false, used_hint: true, offline: false, seen: true, correct: 8, score: 4 }] }).rows;
    expect(h).toMatchObject({ kind: "link", first: false, usedHint: true, seen: true });
    expect(Object.keys(h!)).not.toContain("correct");
    expect(Object.keys(h!)).not.toContain("score");
  });
  it("seen: a row with no feedback is just 'seen' (no message)", () => {
    const [s] = parseSeen({ items: [{ src: "submission", ref: "r", assignment_id: "x", title: "Link", kind: "link", submitted_at: "2026-11-10T00:00:00Z", seen_at: "2026-11-11T00:00:00Z", praise: null, notes: null, fb_state: null }] }) as [SeenRow];
    expect(hasMessage(s)).toBe(false);
    expect(s.notes).toEqual([]);
  });
  it("seen: praise, items with excerpts, the revision step to open", () => {
    const [s] = parseSeen({ items: [{ src: "attempt", ref: "r", activity_id: "a", title: "Viết", kind: "app", submitted_at: "2026-11-10T00:00:00Z", seen_at: "2026-11-11T00:00:00Z", praise: "Rõ ý.", notes: [{ n: 1, text: "Thêm câu kết.", excerpt: "x" }], fb_state: "todo", revision_activity_id: "rev", closing_note: null }] }) as [SeenRow];
    expect(hasMessage(s)).toBe(true);
    expect(s).toMatchObject({ state: "todo", revisionActivityId: "rev", notes: [{ n: 1, text: "Thêm câu kết.", excerpt: "x" }] });
  });
});
