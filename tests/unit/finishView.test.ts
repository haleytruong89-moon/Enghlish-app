import { describe, expect, it } from "vitest";
import { buildFinishParts, feedbackSuggestions, finishReady, isIssue, partTally, stateWith, tallyParts, type Verdict } from "@/lib/finish/view";
import { finishCopy } from "@/lib/copy/vi";
import { hasScoreWords } from "@/lib/revision/scoreWords";
import type { ItemMeta } from "@/lib/results/score";

const R = (result: string) => ({ kind: "mcq", result: result as "correct" });
const base = () => {
  const ids = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9"];
  const meta = new Map<string, ItemMeta>([
    ["q1", { n: 1, part: "A", tag: null, outOfApp: false }],
    ["q2", { n: 2, part: "A", tag: null, outOfApp: false }],
    ["q3", { n: 3, part: "A", tag: null, outOfApp: false }],
    ["q4", { n: 4, part: "C", tag: null, outOfApp: false }],
    ["q5", { n: 5, part: "C", tag: null, outOfApp: false }],
    ["q6", { n: 6, part: "C", tag: null, outOfApp: false }],
    ["q7", { n: 7, part: "E", tag: null, outOfApp: false }],
    ["q8", { n: 8, part: "E", tag: null, outOfApp: false }],
    ["q9", { n: 9, part: "E", tag: null, outOfApp: true }],
  ]);
  return {
    items: ids.map((id) => ({ id, stem: `stem ${id}` })),
    answers: { q1: "a", q2: "b", q3: "c", q4: "so tired that", q5: "I wish I can", q6: "", q7: "more easy", q8: "tall as" } as Record<string, unknown>,
    checks: {
      total: 9, checked: 6, correct: 4,
      items: { q1: R("correct"), q2: R("correct"), q3: R("correct"), q4: R("needs_person"), q5: R("needs_person"), q6: R("blank"), q7: R("incorrect"), q8: R("correct"), q9: R("needs_person") },
    },
    keys: [{ itemId: "q7", kind: "answer" as const, answer: "easier", explanationVi: null }],
    decisions: { q5: "incorrect" } as Record<string, Verdict>,
    meta,
    partNames: new Map([["A", "Chọn đáp án"], ["E", "E · So sánh"]]),
    retries: [{ itemId: "q7", n: 7, stem: "", given: "more easy", retry: "easier", kind: "retry" as const, at: "2026-11-24T05:00:00Z" }],
  };
};

describe("L1 view model", () => {
  const parts = buildFinishParts(base());
  it("groups by part in order of first appearance, with the part names; items keep their numbers", () => {
    expect(parts.map((p) => [p.key, p.label])).toEqual([["A", "A · Chọn đáp án"], ["C", "C"], ["E", "E · So sánh"]]);
    expect(parts[2]!.items.map((i) => i.n)).toEqual([7, 8, 9]);
    expect(parts[2]!.items[0]).toMatchObject({ given: "more easy", key: "easier", state: "incorrect", retry: { text: "easier", revealed: false } });
  });
  it("app check, adult decision, waiting, paper", () => {
    const c = parts[1]!.items;
    expect(c.map((i) => [i.id, i.state, i.byAdult, i.needsAdult])).toEqual([
      ["q4", "waiting", false, true],
      ["q5", "incorrect", true, false],
      ["q6", "blank", false, false],
    ]);
    expect(parts[2]!.items[2]).toMatchObject({ id: "q9", state: "paper", needsAdult: false });
  });
  it("local verdicts apply only to a waiting question; tallies skip paper, count blank as not right", () => {
    expect(stateWith(parts[1]!.items[0]!, { q4: "correct" })).toBe("correct");
    expect(stateWith(parts[0]!.items[0]!, { q1: "incorrect" })).toBe("correct");
    expect(tallyParts(parts)).toEqual({ correct: 4, decided: 7, pending: 1 });
    expect(tallyParts(parts, { q4: "correct" })).toEqual({ correct: 5, decided: 8, pending: 0 });
    expect(partTally(parts[2]!)).toEqual({ correct: 1, decided: 2, pending: 0 });
  });
  it("issues = waiting, wrong, blank or retried", () => {
    expect(parts.flatMap((p) => p.items).filter((i) => isIssue(i)).map((i) => i.id)).toEqual(["q4", "q5", "q6", "q7"]);
    expect(isIssue(parts[1]!.items[0]!, { q4: "correct" })).toBe(false);
  });
  it("a question without a part goes to one group 'Các câu'", () => {
    const b = base();
    const p = buildFinishParts({ ...b, meta: new Map() });
    expect(p.map((x) => x.label)).toEqual([finishCopy.noPart]);
  });
});

describe("L1 suggestions (app-made, words only)", () => {
  it("fixes weakest first with the question numbers; praise for parts all right", () => {
    const s = feedbackSuggestions(buildFinishParts(base()), { q4: "correct" });
    expect(s.fixes).toEqual(["Phần C: xem lại câu 5, 6.", "Phần E · So sánh: xem lại câu 7."]);
    expect(s.praise).toEqual(["Phần A · Chọn đáp án: con làm đúng hết, rất chắc tay."]);
    for (const t of [...s.fixes, ...s.praise]) expect(hasScoreWords(t), t).toBe(false);
  });
  it("all right → one praise for the whole test; a long list is cut", () => {
    const b = base();
    const allRight = buildFinishParts({ ...b, checks: { ...b.checks, items: Object.fromEntries(Object.keys(b.checks.items).map((k) => [k, R("correct")])) }, decisions: {} });
    expect(feedbackSuggestions(allRight)).toEqual({ praise: [finishCopy.suggest.praiseAll], fixes: [] });
    const many = Array.from({ length: 9 }, (_, k) => `q${k + 1}`);
    const wrong = buildFinishParts({ ...b, items: many.map((id) => ({ id, stem: "" })), meta: new Map(), checks: { ...b.checks, items: Object.fromEntries(many.map((k) => [k, R("incorrect")])) } });
    expect(feedbackSuggestions(wrong).fixes).toEqual(["Xem lại câu 1, 2, 3, 4, 5, 6 (và 3 câu khác)."]);
  });
});

describe("L1 readiness", () => {
  it("needs no waiting question and some feedback", () => {
    expect(finishReady({ waiting: 0, hasFeedback: true })).toEqual({ ready: true, missing: [] });
    expect(finishReady({ waiting: 2, hasFeedback: false })).toEqual({ ready: false, missing: ["grade", "feedback"] });
  });
});
