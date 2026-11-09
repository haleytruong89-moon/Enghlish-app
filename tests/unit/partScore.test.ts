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
