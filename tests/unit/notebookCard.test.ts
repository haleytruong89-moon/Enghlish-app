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
  it("an unknown field (e.g. ipa written by the model) is dropped, never shown: L3", () => {
    const r = cardContentSchema.parse({ ...GOOD, ipa: "/meɪk/", checks: [{ ...GOOD.checks[0]!, explanation: "x" }] });
    expect("ipa" in r).toBe(false);
    expect("explanation" in r.checks[0]!).toBe(false);
  });
  it("a phrasal verb split by its object still counts in an example", () => {
    const card = with_({ headword: "turn down", forms: ["turn down", "turned down"], family: [], examples: [{ en: "She turned the offer down.", vi: "x" }, { en: "Please turn it down.", vi: "y" }] });
    expect(cardCodeReasons(card, { headword: "turn down", language: "vi" })).not.toContain("example_missing_word");
    expect(cardCodeReasons(with_({ headword: "turn down", forms: ["turn down"], family: [], examples: [{ en: "Turn left, then go down the hill and further down.", vi: "x" }, { en: "x", vi: "y" }] }), { headword: "turn down", language: "vi" })).toContain("example_missing_word");
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
    ["IPA in brackets", with_({ stress_tip: "Đọc là [meɪk]." }), "has_ipa"],
    ["a headword the database refuses", with_({ headword: "café", forms: ["café"] }), "bad_headword"],
  ])("%s", (_n, card, reason) => expect(cardCodeReasons(card, opts)).toContain(reason));
  it("the child's sentence never goes into the shared card: 4 words in a row or a name from it", async () => {
    const { copiesChildText } = await import("@/lib/notebook/card");
    const ctx = "My friend Minh at Tô Hoàng makes cakes every Sunday.";
    expect(cardCodeReasons(GOOD, { ...opts, context: ctx })).toEqual([]);
    expect(copiesChildText({ e: "Minh makes tea." }, ctx, "make")).toBe(true);
    expect(copiesChildText({ e: "Minh at Tô Hoàng makes cakes." }, ctx, "make")).toBe(true);
    expect(copiesChildText({ e: "She makes cakes every Sunday morning." }, "Mum makes cakes every Sunday.", "make")).toBe(true); // 5 words in a row
    expect(copiesChildText({ e: "She makes cakes at the weekend." }, ctx, "make")).toBe(false);
    expect(copiesChildText({ e: "We meet on Sunday." }, ctx, "make")).toBe(true); // strict: any capitalised word of the sentence
    expect(copiesChildText({ e: "I like it." }, "I make it.", "make")).toBe(false);
  });
  it("a form of the word counts in an example (made, making)", () => {
    expect(cardCodeReasons(with_({ examples: [{ en: "She made tea.", vi: "x" }, { en: "Making friends is fun.", vi: "y" }] }), opts)).toEqual([]);
  });
  it("en_first allows five lines and no Vietnamese accent check", () => {
    const card = with_({ why: "a\nb\nc\nd\ne", senses: [{ meaning_vi: "tao ra", meaning_en: "to create" }] });
    expect(cardCodeReasons(card, { headword: "make", language: "en_first" })).toEqual([]);
    expect(linesOf("x".repeat(230))).toBe(3);
  });
});

describe("tool top level is lenient, the card is strict", () => {
  it("not_word without suggestions or with card: null; ok with an extra suggestions: []", () => {
    expect(cardToolOutputSchema.parse({ status: "not_word" })).toEqual({ status: "not_word", suggestions: [] });
    expect(cardToolOutputSchema.parse({ status: "not_word", card: null, suggestions: null })).toEqual({ status: "not_word", suggestions: [] });
    expect(cardToolOutputSchema.parse({ status: "ok", card: GOOD, suggestions: [] })).toEqual({ status: "ok", card: GOOD });
    expect(cardToolOutputSchema.parse({ status: "ok", card: { ...GOOD, ipa: "/x/" } })).toEqual({ status: "ok", card: GOOD });
    expect(cardToolOutputSchema.parse({ ...GOOD })).toEqual({ status: "ok", card: GOOD }); // no status wrapper
    expect(cardToolOutputSchema.parse({ card: GOOD })).toEqual({ status: "ok", card: GOOD });
  });
});
