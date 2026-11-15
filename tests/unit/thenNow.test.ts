import { describe, expect, it } from "vitest";
import { isOrderedPair, normalizeNote, NOTE_MAX, preview } from "@/lib/student/thenNow";
import { parseMyThenNow, parseThenNowCandidates } from "@/lib/student/growthShape";

describe("then-now helpers (W4e · Q16)", () => {
  it("the note is trimmed, empty is none, and 200 characters is the limit (never cut for the tutor)", () => {
    expect(normalizeNote("  Hai tháng đấy!  ")).toEqual({ ok: true, note: "Hai tháng đấy!" });
    expect(normalizeNote("   ")).toEqual({ ok: true, note: null });
    expect(normalizeNote("a".repeat(NOTE_MAX))).toMatchObject({ ok: true });
    expect(normalizeNote("a".repeat(NOTE_MAX + 1))).toEqual({ ok: false });
  });
  it("a pair is ordered only when 'then' is on an earlier Vietnam day", () => {
    expect(isOrderedPair("2026-09-15T03:00:00Z", "2026-11-13T03:00:00Z")).toBe(true);
    expect(isOrderedPair("2026-11-13T01:00:00Z", "2026-11-13T09:00:00Z")).toBe(false);
    expect(isOrderedPair("2026-11-13T16:00:00Z", "2026-11-13T18:00:00Z")).toBe(true); // 23:00 and 01:00 next day in Vietnam
  });
  it("preview keeps short text, cuts long text at a word", () => {
    expect(preview("Short   text")).toBe("Short text");
    const p = preview("word ".repeat(40), 30);
    expect(p.endsWith("…")).toBe(true);
    expect([...p].length).toBeLessThanOrEqual(31);
  });
});

describe("parsers", () => {
  const piece = { on: "2026-09-15T03:00:00Z", text: "I like cat." };
  it("the child's pair: strict shape, null passes through", () => {
    expect(parseMyThenNow(null)).toBeNull();
    expect(parseMyThenNow({ then: piece, now: { ...piece, on: "2026-11-13T03:00:00Z" }, note: null })).toMatchObject({ then: { on: "2026-09-15" }, now: { on: "2026-11-13" } });
    expect(() => parseMyThenNow({ then: piece, now: piece, note: null, score: 3 })).toThrow();
  });
  it("the adult list", () => {
    const r = parseThenNowCandidates({ candidates: [{ id: "a", at: "2026-11-13T03:00:00Z", title: null, preview: "x", provenance: "manual_import" }], current: null });
    expect(r?.candidates[0]).toMatchObject({ id: "a", on: "2026-11-13", provenance: "manual_import" });
    expect(r?.current).toBeNull();
  });
});
