import { describe, expect, it } from "vitest";
import { buildCando, candoEverMap, candoTimes, NEW_WITHIN_DAYS } from "@/lib/student/cando";
import { parseMyCando } from "@/lib/student/growthShape";
import { skillNames } from "@/lib/copy/vi";

const NOW = "2026-11-16T03:00:00Z";
const r = (name: string, at: string, code: string | null = null) => ({ code, name, at });

describe("buildCando (W4e · Q17)", () => {
  it("newest first; 'Mới' = confirmed within 7 days of the DATABASE's day", () => {
    const items = buildCando([r("Cũ", "2026-10-01T03:00:00Z"), r("Mới nhất", "2026-11-16T01:00:00Z"), r("Tuần trước", "2026-11-09T03:00:00Z"), r("Tám ngày", "2026-11-08T03:00:00Z")], NOW);
    expect(items.map((i) => i.text)).toEqual(["Mới nhất", "Tuần trước", "Tám ngày", "Cũ"]);
    expect(items.map((i) => i.isNew)).toEqual([true, true, false, false]);
    expect(NEW_WITHIN_DAYS).toBe(7);
  });
  it("a Track A skill uses the name for the student (UX §3.4), a knowledge item and other skills keep their own Vietnamese title", () => {
    const items = buildCando([r("Viết \"vì sao – nên\"", "2026-11-10T03:00:00Z", "A-L3-CAUSE-W"), r("Thì hiện tại hoàn thành (since / for)", "2026-11-09T03:00:00Z"), r("Một kỹ năng khác", "2026-11-08T03:00:00Z", "B-X")], NOW, skillNames);
    expect(items.map((i) => i.text)).toEqual(["Viết được vì sao và kết quả", "Thì hiện tại hoàn thành (since / for)", "Một kỹ năng khác"]);
  });
  it("the same words twice are one card; empty names are dropped; the date is the Vietnam day", () => {
    const items = buildCando([r("Đọc hiểu", "2026-11-10T18:00:00Z"), r("đọc hiểu", "2026-11-01T03:00:00Z"), r("  ", "2026-11-02T03:00:00Z")], NOW);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ text: "Đọc hiểu", date: "2026-11-11" });
  });
  it("a skill card is kind skill, a knowledge item is kind point (its own lead)", () => {
    const items = buildCando([r("A", "2026-11-12T03:00:00Z", "A-T1-TEXT-R"), r("B", "2026-11-11T03:00:00Z")], NOW);
    expect(items.map((i) => i.kind)).toEqual(["skill", "point"]);
  });
  it("nothing numeric leaks into the text and the times for the achievement are oldest first", () => {
    const items = buildCando([r("A", "2026-11-12T03:00:00Z"), r("B", "2026-11-03T03:00:00Z")], NOW);
    expect(candoTimes(items)).toEqual(["2026-11-03T03:00:00Z", "2026-11-12T03:00:00Z"]);
    expect(buildCando([], NOW)).toEqual([]);
    expect(candoEverMap([{ n: 5, at: "a" }, { n: 10, at: "b" }])).toEqual({ 5: "a", 10: "b" });
  });
});

describe("parseMyCando", () => {
  it("accepts the shape, passes null through and refuses a key a child must never get", () => {
    expect(parseMyCando(null)).toBeNull();
    expect(parseMyCando({ now: NOW, items: [{ code: null, name: "x", at: NOW }], ever: [{ n: 5, at: NOW }] })?.items).toHaveLength(1);
    expect(() => parseMyCando({ now: NOW, items: [{ code: null, name: "x", at: NOW, state: "INDEPENDENT" }], ever: [] })).toThrow();
    expect(() => parseMyCando({ now: NOW, items: [], ever: [], level_num: 3 })).toThrow();
  });
});
