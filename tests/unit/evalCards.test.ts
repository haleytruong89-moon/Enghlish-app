import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { caseProblems, casesFileSchema, summarize, type CardResult } from "../../scripts/lib/evalCards";
import { checkLookupInput, isBlocked } from "@/lib/notebook/input";

describe("word card test set (E2a)", () => {
  const file = casesFileSchema.parse(JSON.parse(readFileSync("tests/eval/cards/cases.json", "utf8")));
  it("40 self-written cases, unique ids, both configurations; blocked cases are blocked by code, others pass the input rules", () => {
    expect(file.cases).toHaveLength(40);
    expect(new Set(file.cases.map((c) => c.id)).size).toBe(40);
    expect(new Set(file.cases.map((c) => c.language))).toEqual(new Set(["vi", "en_first"]));
    for (const c of file.cases) {
      const r = checkLookupInput(c.word, c.context);
      expect(r.ok, c.id).toBe(true);
      if (r.ok) expect(isBlocked(r.headword), c.id).toBe(c.expect === "blocked");
    }
  });
  it("hard rules: outcome, lemma, sense, typo, personal info from the sentence", () => {
    const c = file.cases.find((x) => x.id === "F01")!;
    expect(caseProblems(c, { outcome: "card", headword: "go", firstSense: "đi" })).toEqual([]);
    expect(caseProblems(c, { outcome: "card", headword: "went" })).toEqual(["headword"]);
    expect(caseProblems(file.cases.find((x) => x.id === "S01")!, { outcome: "card", headword: "bank", firstSense: "ngân hàng" })).toEqual(["sense"]);
    expect(caseProblems(file.cases.find((x) => x.id === "T01")!, { outcome: "not_word", suggestions: ["receive"] })).toEqual([]);
    expect(caseProblems(file.cases.find((x) => x.id === "I03")!, { outcome: "card", headword: "school", cardText: "Minh goes to school" })).toEqual(["personal_info"]);
    expect(caseProblems(file.cases.find((x) => x.id === "B01")!, { outcome: "card" })).toEqual(["outcome_card"]);
  });
  it("the summary has the share of cards passing the template and the hard-rule count", () => {
    const ok = { core_ok: true, guess_ok: true, examples_contrast: true, vn_trap_ok: true, checks_ok: true, task_ok: true, sense_ok: true, safe: true, notes: "" };
    const rs: CardResult[] = [
      { id: "W01", expect: "card", outcome: "card", fixed: null, guard: "pass", cost: 0.03, ms: 1, problems: [], audit: ok },
      { id: "W02", expect: "card", outcome: "card", fixed: null, guard: "pass", cost: 0.03, ms: 1, problems: [], audit: { ...ok, guess_ok: false } },
    ];
    const md = summarize("cards-v1", rs, 0.06);
    expect(md).toContain("đạt mọi tiêu chí khuôn: 1 (50 %");
    expect(md).toContain("✗ guess_ok");
  });
});
