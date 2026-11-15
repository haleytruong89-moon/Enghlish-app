import { describe, expect, it } from "vitest";
import { buildLevelsView, latestLevelDate, type LevelDomainRaw } from "@/lib/student/levels";
import { parseMyLevels } from "@/lib/student/growthShape";

const d = (key: string, name: string, level: string | null, scale: "cefr" | "task_level" = "cefr", on: string | null = level ? "2026-11-07T03:00:00Z" : null): LevelDomainRaw => ({ key, name, scale, level, on });

describe("buildLevelsView (W4e · S-5, Q18)", () => {
  it("one tile per CEFR domain in the order given: the confirmed name, or no level while the tutor has not confirmed", () => {
    const v = buildLevelsView([d("grammar", "Ngữ pháp", "B2"), d("vocab", "Từ vựng", null), d("listening", "Nghe", "B1+")]);
    expect(v.tiles).toEqual([
      { key: "grammar", name: "Ngữ pháp", level: "B2", on: "2026-11-07" },
      { key: "vocab", name: "Từ vựng", level: null, on: null },
      { key: "listening", name: "Nghe", level: "B1+", on: "2026-11-07" },
    ]);
    expect(v.confirmed).toBe(2);
  });
  it("hides a domain by its SCALE, never by its name: a task-level domain is gone, a CEFR domain named Tư duy would show", () => {
    const v = buildLevelsView([d("thinking", "Tư duy", "3", "task_level"), d("grammar", "Ngữ pháp", "B2", "task_level"), d("x", "Tư duy", "B1")]);
    expect(v.tiles.map((t) => t.key)).toEqual(["x"]);
  });
  it("never shows anything that is not a CEFR name (a number or free text counts as not confirmed)", () => {
    const v = buildLevelsView([d("a", "A", "3"), d("b", "B", "đạt"), d("c", "C", "C3"), d("e", "E", "A2+")]);
    expect(v.tiles.map((t) => t.level)).toEqual([null, null, null, "A2+"]);
    expect(v.confirmed).toBe(1);
  });
  it("a level without a confirmation time is not shown; the date is the Vietnam day", () => {
    expect(buildLevelsView([d("a", "A", "B1", "cefr", null)]).tiles[0]?.level).toBeNull();
    expect(buildLevelsView([d("a", "A", "B1", "cefr", "2026-11-07T18:00:00Z")]).tiles[0]?.on).toBe("2026-11-08");
  });
  it("latestLevelDate is the newest confirmation, or null", () => {
    expect(latestLevelDate(buildLevelsView([]))).toBeNull();
    expect(latestLevelDate(buildLevelsView([d("a", "A", null)]))).toBeNull();
    expect(latestLevelDate(buildLevelsView([d("a", "A", "B1", "cefr", "2026-10-01T03:00:00Z"), d("b", "B", "B2", "cefr", "2026-11-07T03:00:00Z")]))).toBe("2026-11-07");
  });
});

describe("parseMyLevels", () => {
  it("accepts the shape, passes null through, and refuses an extra key (a score would be a fault)", () => {
    expect(parseMyLevels(null)).toBeNull();
    expect(parseMyLevels({ domains: [{ key: "grammar", name: "Ngữ pháp", scale: "cefr", level: "B2", on: "2026-11-07T03:00:00Z" }] })).toHaveLength(1);
    expect(() => parseMyLevels({ domains: [{ key: "g", name: "G", scale: "cefr", level: "B2", on: "2026-11-07T03:00:00Z", level_num: 5 }] })).toThrow();
    expect(() => parseMyLevels({ domains: [], assumed: {} })).toThrow();
  });
});
