import { describe, expect, it } from "vitest";
import { normalizeIpa, parseIpaLine, phraseIpa } from "@/lib/notebook/ipa";

describe("ipa-dict → learner-style IPA (code, never AI: L3)", () => {
  it.each([
    ["/mˈeɪk/", "/ˈmeɪk/"],
    ["/vɒlkˈeɪnəʊ/", "/vɒlˈkeɪnəʊ/"], // "lk" is not an onset: only "k" moves
    ["/kɐθˈiːdɹəl/", "/kəˈθiːdrəl/"],
    ["/skˈɐlptʃə/", "/ˈskʌlptʃə/"], // "sk" is an onset; stressed ɐ → ʌ
    ["/ˈɑːdvɑːk/", "/ˈɑːdvɑːk/"], // already first
    ["/ɪnfˈɔːmˌeɪʃən/", "/ɪnˈfɔːˌmeɪʃən/"], // secondary stress too
    ["/stɹˈiːt/", "/ˈstriːt/"], // "str" is an onset
    ["/bjˈuːtɪfəl/", "/ˈbjuːtɪfəl/"],
    ["/skˈʌlptʃɐ/", "/ˈskʌlptʃə/"], // unstressed ɐ → ə
  ])("%s → %s", (raw, want) => expect(normalizeIpa(raw)).toBe(want));

  it("reads one line with one or two variants", () => {
    expect(parseIpaLine("read\t/ˈɹɛd/, /ˈɹid/")).toEqual({ word: "read", ipa: ["/ˈɹɛd/", "/ˈɹid/"] });
    expect(parseIpaLine("Make\t/mˈeɪk/")).toEqual({ word: "make", ipa: ["/mˈeɪk/"] });
    expect(parseIpaLine("")).toBeNull();
    expect(parseIpaLine("no-tab-here")).toBeNull();
    expect(parseIpaLine("word\tnot-ipa")).toBeNull();
  });

  it("a phrase is joined word by word; one missing word = no line at all", () => {
    const m = new Map([["make", ["/ˈmeɪk/"]], ["friends", ["/ˈfrendz/"]]]);
    expect(phraseIpa(["make", "friends"], m)).toBe("/ˈmeɪk ˈfrendz/");
    expect(phraseIpa(["Make"], m)).toBe("/ˈmeɪk/");
    expect(phraseIpa(["make", "zzz"], m)).toBeNull();
    expect(phraseIpa([], m)).toBeNull();
  });
});

describe("seed-ipa rows (no network)", () => {
  it("normalizes, dedupes variants, keeps the first line of a word", async () => {
    const { rowsOf } = await import("../../scripts/seed-ipa");
    expect(rowsOf("make\t/mˈeɪk/\nread\t/ˈɹɛd/, /ˈɹɛd/, /ˈɹid/\nmake\t/x/\n\nbad line")).toEqual([
      { word: "make", ipa: ["/ˈmeɪk/"] },
      { word: "read", ipa: ["/ˈrɛd/", "/ˈrid/"] },
    ]);
  });
});
