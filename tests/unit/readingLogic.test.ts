import { describe, expect, it, vi } from "vitest";
import { tutorWorkErrors } from "@/lib/copy/vi";
import { monthsBack } from "@/lib/reading/months";
import { buildReadingRows } from "@/lib/reading/rows";
import { loadSoft } from "@/lib/reading/soft";
import type { ReadingSkillsView } from "@/lib/reading/types";
import { failText } from "@/lib/tutorwork/client";

const tags = [{ key: "doc-a" }, { key: "doc-b" }, { key: "doc-c" }];

describe("buildReadingRows", () => {
  it("leaves out empty rows and rows with 0 questions (no question that month), keeps the order of the skills", () => {
    expect(buildReadingRows(tags, { "doc-a": { q: "", pct: "" }, "doc-b": { q: "0", pct: "" }, "doc-c": { q: "5", pct: "40" } })).toEqual([{ tag_key: "doc-c", questions: 5, correct_pct: 40 }]);
    expect(buildReadingRows(tags, { "doc-a": { q: "0", pct: "0" } })).toEqual([]);
  });
  it("refuses half-filled rows, non-numbers and out-of-range numbers", () => {
    for (const c of [{ q: "5", pct: "" }, { q: "", pct: "50" }, { q: "x", pct: "1" }, { q: "4.5", pct: "1" }, { q: "501", pct: "1" }, { q: "4", pct: "101" }]) {
      expect(buildReadingRows(tags, { "doc-a": c }), JSON.stringify(c)).toBeNull();
    }
    expect(buildReadingRows(tags, { "doc-a": { q: "500", pct: "100" } })).toEqual([{ tag_key: "doc-a", questions: 500, correct_pct: 100 }]);
  });
});

describe("loadSoft (the weak page must not 500 because of the reading table)", () => {
  const view = { minQuestions: 4, weakPct: 60, latestMonth: null, latestSource: null, previousMonth: null, skills: [] } satisfies ReadingSkillsView;
  it("returns the view when the loader works", async () => {
    const onError = vi.fn();
    expect(await loadSoft(async () => view, onError)).toBe(view);
    expect(onError).not.toHaveBeenCalled();
  });
  it("returns null and reports the error when the loader throws (e.g. migration 0018 not applied)", async () => {
    const onError = vi.fn();
    expect(await loadSoft(async () => { throw new Error("function eng_reading_skills does not exist"); }, onError)).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });
  it("still returns null when the error reporter itself fails", async () => {
    expect(await loadSoft(async () => { throw new Error("x"); }, () => { throw new Error("log down"); })).toBeNull();
  });
});

describe("misc", () => {
  it("monthsBack does calendar arithmetic across years", () => {
    expect(monthsBack("2026-10", 24)).toBe("2024-10");
    expect(monthsBack("2026-02", 3)).toBe("2025-11");
    expect(monthsBack("2026-01", 1)).toBe("2025-12");
  });
  it("a stale correction has its own sentence", () => {
    expect(failText({ ok: false, status: 409, error: "stale_report" })).toBe(tutorWorkErrors.staleReport);
    expect(tutorWorkErrors.staleReport).toBe("Báo cáo tháng này vừa được người khác sửa. Tải lại trang rồi sửa lại.");
  });
});
