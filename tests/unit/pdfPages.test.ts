import { describe, expect, it } from "vitest";
import { formatPages, parsePages } from "@/lib/pdf/pages";

describe("parsePages", () => {
  it("reads single pages and ranges, 1-based on screen, 0-based inside", () => {
    expect(parsePages("1-3, 7", 10)).toEqual({ ok: true, pages: [0, 1, 2, 6] });
    expect(parsePages(" 2 ", 10)).toEqual({ ok: true, pages: [1] });
  });
  it("accepts the en dash and removes repeats", () => {
    expect(parsePages("1–3,2,3", 10)).toEqual({ ok: true, pages: [0, 1, 2] });
    expect(parsePages("7,1,7", 10)).toEqual({ ok: true, pages: [0, 6] });
  });
  it("refuses empty text, bad syntax and pages outside the file", () => {
    expect(parsePages("  ", 10)).toEqual({ ok: false, reason: "empty" });
    expect(parsePages(",", 10)).toEqual({ ok: false, reason: "empty" });
    expect(parsePages("a", 10)).toEqual({ ok: false, reason: "syntax" });
    expect(parsePages("3-1", 10)).toEqual({ ok: false, reason: "syntax" });
    expect(parsePages("1-", 10)).toEqual({ ok: false, reason: "syntax" });
    expect(parsePages("0", 10)).toEqual({ ok: false, reason: "range" });
    expect(parsePages("5-11", 10)).toEqual({ ok: false, reason: "range" });
  });
});

describe("formatPages", () => {
  it("joins runs", () => {
    expect(formatPages([0, 1, 2, 6])).toBe("1–3, 7");
    expect(formatPages([4])).toBe("5");
    expect(formatPages([2, 0, 1, 1])).toBe("1–3");
    expect(formatPages([])).toBe("");
  });
});
