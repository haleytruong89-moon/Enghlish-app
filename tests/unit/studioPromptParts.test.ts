import { describe, expect, it } from "vitest";
import { buildStudioBuild } from "@/lib/studio/buildTemplate";
import { instructionFor, promptLines } from "@/lib/studio/promptParts";
import type { StudioDraft, StudioItem } from "@/lib/studio/schema";

const q = (n: number, part: string, over: Partial<StudioItem> = {}): StudioItem => ({
  n, part, kind: "gap", out_of_app: false, stem: `S${n} ____.`, options: [], passage_ref: null, key: `k${n}`, accepted: [],
  tag_key: "dang-tu", target_id: null, reading_skill_key: null, explanation_vi: "", needs_review: false, review_reason: null, ...over,
});
const D: StudioDraft = {
  parts: [
    { key: "A", name: "A · Topic vocabulary · tr.114", instructions: "Choose the correct word." },
    { key: "B", name: "B · Word formation", instructions: "Use the word in capitals.\nBox: debt · share" },
    { key: "C", name: "C · Writing", instructions: "On paper." },
    { key: "D", name: "D · One question", instructions: "" },
  ],
  passages: [],
  items: [q(1, "A"), q(2, "A"), q(3, "B"), q(4, "B"), q(5, "B"), q(6, "C", { out_of_app: true }), q(7, "D")],
};

describe("instructions per question (what the child reads above each question)", () => {
  it("the prompt names the questions of each part; a paper-only part is left out", () => {
    const p = buildStudioBuild(D).template.prompt_en;
    expect(p.split("\n")).toEqual([
      "Questions 1–2 · A · Topic vocabulary · tr.114: Choose the correct word.",
      "Questions 3–5 · B · Word formation: Use the word in capitals. Box: debt · share",
      "Question 7 · D · One question",
    ]);
  });

  it("each question finds the instruction of its own part", () => {
    const p = buildStudioBuild(D).template.prompt_en;
    expect(instructionFor(p, 1)).toBe("A · Topic vocabulary · tr.114: Choose the correct word.");
    expect(instructionFor(p, 4)).toBe("B · Word formation: Use the word in capitals. Box: debt · share");
    expect(instructionFor(p, 7)).toBe("D · One question");
    expect(instructionFor(p, 6)).toBeNull();
    expect(promptLines(p)).toHaveLength(3);
  });

  it("a test approved before this change (no question numbers in the prompt) gives no line, and the prompt shows as it was", () => {
    const old = "A · Topic vocabulary: Choose the correct word.\nB · Word formation: Use the word.";
    expect(instructionFor(old, 1)).toBeNull();
    expect(promptLines(old).map((l) => l.text)).toEqual(["A · Topic vocabulary: Choose the correct word.", "B · Word formation: Use the word."]);
  });

  it("a test whose parts are listed out of number order still finds the right line", () => {
    const p = "Questions 6–9 · B: second\nQuestions 1–5 · A: first";
    expect(instructionFor(p, 7)).toBe("B: second");
    expect(instructionFor(p, 2)).toBe("A: first");
  });
});

describe("hyphenated answers also accept a space (fifty-fifty = fifty fifty)", () => {
  it("adds the spaced form for gap / word_form / short / transform keys, never twice, never for a choice", () => {
    const d: StudioDraft = {
      ...D,
      parts: [D.parts[0]!],
      items: [
        q(1, "A", { key: "fifty-fifty" }),
        q(2, "A", { key: "halves", accepted: ["fifty-fifty", "fifty fifty"] }),
        q(3, "A", { kind: "mcq", key: "A", options: [{ letter: "A", text: "well-off" }, { letter: "B", text: "x" }] }),
        q(4, "A", { kind: "transform", key: "a short-term loan" }),
      ],
    };
    const keys = Object.fromEntries(buildStudioBuild(d).keys.map((k) => [k.item_id, k.answer]));
    expect(keys).toEqual({ q1: "fifty-fifty / fifty fifty", q2: "halves / fifty-fifty / fifty fifty", q3: "A", q4: "a short-term loan / a short term loan" });
  });
});
