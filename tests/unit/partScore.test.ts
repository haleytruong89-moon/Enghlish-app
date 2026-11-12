import { describe, expect, it } from "vitest";
import { combineParts, emptyPart, overall, rowFromStored, titleWithParts, type PartRow } from "@/lib/tutorwork/partScore";

const p = (name: string, correct: string, total: string, wrong = ""): PartRow => ({ name, correct, total, wrong });
const word = (n: number) => `Phần ${n}`;

describe("combineParts", () => {
  it("one part is exactly the old quick entry", () => {
    expect(combineParts([p("", "8", "10", "4, 7")])).toMatchObject({ ok: true, total: 10, correct: 8, wrong: [4, 7] });
  });
  it("lays parts end to end: the second part's item 2 is global item 12", () => {
    const r = combineParts([p("Nghe", "9", "10", "3"), p("Đọc", "13", "15", "2, 15")]);
    expect(r).toMatchObject({ ok: true, total: 25, correct: 22, wrong: [3, 12, 25] });
    if (r.ok) expect(r.entries.map((e) => [e.part, e.local])).toEqual([[0, 3], [1, 2], [1, 15]]);
  });
  it("reports the first problem with its row", () => {
    expect(combineParts([p("", "8", "", "")])).toEqual({ ok: false, error: "needTotal", row: 0 });
    expect(combineParts([p("", "5", "10", "1,2,3,4,5"), p("", "11", "10")])).toEqual({ ok: false, error: "needCorrect", row: 1 });
    expect(combineParts([p("", "9", "10", "11")])).toEqual({ ok: false, error: "wrongInvalid", row: 0 });
    expect(combineParts([p("", "8", "10", "4")])).toEqual({ ok: false, error: "wrongCountMismatch", row: 0 });
    expect(combineParts([p("", "300", "300"), p("", "201", "201")])).toEqual({ ok: false, error: "tooMany", row: 1 });
  });
  it("a part with nothing wrong needs no wrong numbers", () => {
    expect(combineParts([p("", "10", "10")])).toMatchObject({ ok: true, wrong: [] });
  });
});

describe("overall", () => {
  it("sums the valid rows and ignores half-typed ones", () => {
    expect(overall([p("", "9", "10"), p("", "13", "15"), p("", "", "5"), emptyPart()])).toEqual({ correct: 22, total: 25 });
    expect(overall([p("", "11", "10")])).toEqual({ correct: 0, total: 0 });
  });
});

describe("titleWithParts", () => {
  it("adds the per-part scores only when there are several parts", () => {
    expect(titleWithParts(" Unit 3 ", [p("", "8", "10")], word)).toBe("Unit 3");
    expect(titleWithParts("Unit 3", [p("Nghe", "9", "10"), p("", "13", "15")], word)).toBe("Unit 3 — Nghe 9/10 · Phần 2 13/15");
  });
  it("never exceeds 200 characters", () => {
    expect(titleWithParts("x".repeat(200), [p("Nghe", "9", "10"), p("Đọc", "1", "2")], word).length).toBeLessThanOrEqual(200);
  });
});

describe("rowFromStored", () => {
  it("holds the stored numbers in one row", () => {
    expect(rowFromStored(10, 8, [4, 7])).toEqual({ name: "", correct: "8", total: "10", wrong: "4, 7" });
  });
});

import { dropPartTags, pruneTags, stripBreakdown, tagsForSave, titleWithPartsInfo, wrongTypedCount } from "@/lib/tutorwork/partScore";
import { paperMode, startMode } from "@/lib/tutorwork/resultMode";

describe("tags keyed by (part, item)", () => {
  it("removing a part drops its tags and moves later parts up", () => {
    const tags = { "0:3": "a", "1:2": "b", "2:5": "c" };
    expect(dropPartTags(tags, 1)).toEqual({ "0:3": "a", "1:5": "c" });
  });
  it("changing a total prunes tags of items that no longer exist", () => {
    const rows = [p("", "7", "10", "3, 9")];
    expect(pruneTags({ "0:3": "a", "0:9": "b" }, rows)).toEqual({ "0:3": "a", "0:9": "b" });
    expect(pruneTags({ "0:3": "a", "0:9": "b" }, [p("", "7", "5", "3, 9")])).toEqual({ "0:3": "a" });
    expect(pruneTags({ "0:3": "a" }, [p("", "7", "10", "4")])).toEqual({});
  });
  it("derives global numbers only at save", () => {
    const r = combineParts([p("", "9", "10", "3"), p("", "13", "15", "2, 7")]);
    if (!r.ok) throw new Error("x");
    expect(tagsForSave(r.entries, { "0:3": "a", "1:2": "b", "1:7": "c", "1:9": "stale" })).toEqual([{ n: 3, tag_key: "a" }, { n: 12, tag_key: "b" }, { n: 17, tag_key: "c" }]);
  });
});

describe("title breakdown", () => {
  it("strips a breakdown left by an earlier save, and never doubles it", () => {
    expect(stripBreakdown("Unit 3 — Nghe 9/10 · Phần 2 13/15")).toBe("Unit 3");
    expect(stripBreakdown("Unit 3 — Nghe 9/10")).toBe("Unit 3");
    expect(stripBreakdown("Unit 3 — ôn tập")).toBe("Unit 3 — ôn tập");
    const two = [p("Nghe", "9", "10"), p("Đọc", "13", "15")];
    expect(titleWithParts("Unit 3 — Nghe 9/10 · Đọc 13/15", two, word)).toBe("Unit 3 — Nghe 9/10 · Đọc 13/15");
  });
  it("a single-part edit drops the stale breakdown", () => {
    expect(titleWithParts("Unit 3 — Nghe 9/10 · Đọc 13/15", [p("", "22", "25")], word)).toBe("Unit 3");
  });
  it("says when the breakdown was left out for length", () => {
    const long = Array.from({ length: 12 }, (_, i) => p(`Phần dài số ${i}`, "1", "2"));
    expect(titleWithPartsInfo("T", long, word).dropped).toBe(true);
    expect(titleWithPartsInfo("T", [p("a", "1", "2"), p("b", "1", "2")], word).dropped).toBe(false);
  });
});

describe("wrongTypedCount", () => {
  it("counts the same deduplicated, in-range items as the validator", () => {
    expect(wrongTypedCount("3, 3, 12, 0, 4", 10)).toBe(2);
    expect(wrongTypedCount("3 4", null)).toBe(0);
  });
});

describe("startMode", () => {
  const base = { editMode: null, hasAssignment: false, assignmentHasFrame: false, framedUrl: false, hasFrames: true } as const;
  it("quick by default; ?mode=frame without an assignment opens the grid", () => {
    expect(startMode(base)).toBe("quick");
    expect(startMode({ ...base, framedUrl: true })).toBe("frame");
  });
  it("?mode=frame with a non-frame assignment stays quick; a frame assignment opens the grid", () => {
    expect(startMode({ ...base, framedUrl: true, hasAssignment: true })).toBe("quick");
    expect(startMode({ ...base, hasAssignment: true, assignmentHasFrame: true })).toBe("frame");
  });
  it("paper / 'Ghi bài khác' go back to quick unless the URL asked for the grid", () => {
    expect(paperMode(false, true)).toBe("quick");
    expect(paperMode(true, true)).toBe("frame");
    expect(paperMode(true, false)).toBe("quick");
  });
});
