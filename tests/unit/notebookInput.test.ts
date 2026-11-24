import { describe, expect, it } from "vitest";
import { checkLookupInput, isBlocked } from "@/lib/notebook/input";

describe("Tra từ: what the child typed (spec §4.2, A4)", () => {
  it("normalizes case, spaces and curly quotes", () => {
    expect(checkLookupInput("  Make  Friends ")).toEqual({ ok: true, headword: "make friends", words: ["make", "friends"], context: null });
    expect(checkLookupInput("don’t")).toMatchObject({ ok: true, headword: "don't" });
    expect(checkLookupInput("well–known")).toMatchObject({ ok: true, headword: "well-known" });
  });
  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["núi lửa", "not_english"],
    ["b2", "not_english"],
    ["'-'", "not_english"],
    ["a b c d e", "too_many_words"],
    ["x".repeat(41), "too_long"],
  ])("%j → %s", (w, code) => expect(checkLookupInput(w)).toEqual({ ok: false, code }));
  it("the sentence is optional, trimmed, cut to 200", () => {
    expect(checkLookupInput("bank", "   ")).toMatchObject({ context: null });
    expect(checkLookupInput("bank", "I sat on the river bank.")).toMatchObject({ context: "I sat on the river bank." });
    const r = checkLookupInput("bank", "a".repeat(250));
    expect(r.ok && r.context?.length).toBe(200);
  });
  it("blocked words stop before any model call, per word of a phrase", () => {
    expect(isBlocked("porn")).toBe(true);
    expect(checkLookupInput("sh*t")).toEqual({ ok: false, code: "not_english" }); // symbols never reach the list
    expect(isBlocked("what the fuck")).toBe(true);
    expect(isBlocked("make")).toBe(false);
    expect(isBlocked("sextant")).toBe(false);
  });
});
