import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cardCodeReasons, cardContentSchema, cardToolOutputSchema, linesOf, type CardContent } from "@/lib/notebook/card";

const FIX = JSON.parse(readFileSync("tests/fixtures/notebook/fake-card.json", "utf8")) as { card: CardContent };
const GOOD = cardContentSchema.parse(FIX.card);
const with_ = (over: Partial<CardContent>): CardContent => ({ ...structuredClone(GOOD), ...over });
const opts = { headword: "make", language: "vi" };

describe("word card: shape (§4.5) and code checks before Haiku", () => {
  it("the fixture card passes the tool shape and every code check", () => {
    expect(cardToolOutputSchema.safeParse(FIX).success).toBe(true);
    expect(cardCodeReasons(GOOD, opts)).toEqual([]);
  });
  it("an unknown field (e.g. ipa written by the model) is refused: L3", () => {
    expect(cardContentSchema.safeParse({ ...GOOD, ipa: "/meɪk/" }).success).toBe(false);
  });
  it("not_word carries suggestions only", () => {
    expect(cardToolOutputSchema.safeParse({ status: "not_word", suggestions: ["receive"] }).success).toBe(true);
  });
  it.each<[string, CardContent, string]>([
    ["an example without the word", with_({ examples: [{ en: "I bake bread.", vi: "x" }, GOOD.examples[0]!] }), "example_missing_word"],
    ["forms without the headword", with_({ forms: ["made"] }), "forms_missing_headword"],
    ["check answer out of range", with_({ checks: [{ q: "q", options: ["a", "b"], right: 2, note: "n" }] }), "check_right_out_of_range"],
    ["same two guess options", with_({ guess: { ...GOOD.guess, options: ["Same", "same "] } }), "options_not_distinct"],
    ["a link", with_({ trap: "See www.example.org for more." }), "has_url"],
    ["IPA written by the model", with_({ stress_tip: "Đọc là /meɪk/." }), "has_ipa"],
    ["why too long for vi", with_({ why: "a\nb\nc\nd\ne" }), "too_many_lines"],
    ["no Vietnamese meaning for vi", with_({ senses: [{ meaning_vi: "to create", meaning_en: null }] }), "missing_vietnamese"],
  ])("%s", (_n, card, reason) => expect(cardCodeReasons(card, opts)).toContain(reason));
  it("a form of the word counts in an example (made, making)", () => {
    expect(cardCodeReasons(with_({ examples: [{ en: "She made tea.", vi: "x" }, { en: "Making friends is fun.", vi: "y" }] }), opts)).toEqual([]);
  });
  it("en_first allows five lines and no Vietnamese accent check", () => {
    const card = with_({ why: "a\nb\nc\nd\ne", senses: [{ meaning_vi: "tao ra", meaning_en: "to create" }] });
    expect(cardCodeReasons(card, { headword: "make", language: "en_first" })).toEqual([]);
    expect(linesOf("x".repeat(230))).toBe(3);
  });
});
