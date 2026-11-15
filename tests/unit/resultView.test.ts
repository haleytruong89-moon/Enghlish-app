import { describe, expect, it } from "vitest";
import { groupResult, parseResultView } from "@/lib/student/result";

const base = {
  attempt_no: 1,
  submitted_at: "2026-11-15T03:00:00Z",
  is_test: false,
  others_fine: true,
  look: [
    { id: "q2", n: 2, stem: "She ___ go.", given: "B. can't", retry: null, can_retry: true },
    { id: "q5", n: 5, stem: "Pick one", given: "", retry: { text: "B" }, can_retry: false },
  ],
  open: [{ id: "q7", n: 7, stem: "Write", given: "I wish" }],
};

describe("parseResultView", () => {
  it("reads the allowed shape", () => {
    const v = parseResultView(base)!;
    expect(v.look.map((x) => [x.n, x.canRetry, x.retryText])).toEqual([[2, true, null], [5, false, "B"]]);
    expect(v.open[0]).toMatchObject({ n: 7, given: "I wish" });
    expect(v.othersFine).toBe(true);
  });
  it("null, {} and unknown shapes give null", () => {
    expect(parseResultView(null)).toBeNull();
    expect(parseResultView({})).toBeNull();
    expect(parseResultView("x")).toBeNull();
  });
  it("any extra key (an answer, an explanation, a count) makes the whole thing null - it can never reach the child", () => {
    for (const extra of [{ expected: "A. must" }, { explanation_vi: "x" }, { correct: 5 }, { score: 1 }]) expect(parseResultView({ ...base, ...extra })).toBeNull();
    expect(parseResultView({ ...base, look: [{ ...base.look[0], expected: "A. must" }] })).toBeNull();
    expect(parseResultView({ ...base, open: [{ ...base.open[0], answer: "x" }] })).toBeNull();
  });
});

describe("groupResult", () => {
  it("practice: items to look at, free items, the 'rest is fine' flag", () => {
    const g = groupResult(parseResultView(base)!);
    expect(g.look).toHaveLength(2);
    expect(g.open).toHaveLength(1);
    expect(g.showOthersFine).toBe(true);
    expect(g.nothing).toBe(false);
    expect(g.retryAllowed).toBe(true);
  });
  it("a test never allows a retry, even if the database said so", () => {
    const g = groupResult(parseResultView({ ...base, is_test: true })!);
    expect(g.retryAllowed).toBe(false);
    expect(g.look.every((x) => !x.canRetry)).toBe(true);
  });
  it("nothing to look at", () => {
    const g = groupResult(parseResultView({ ...base, look: [], open: [] })!);
    expect(g.nothing).toBe(true);
  });
});

describe("parseResultView · marks of a practice work (D39)", () => {
  const mark = (over: Record<string, unknown> = {}) => ({ id: "q2", n: 2, stem: "s", given: "B", mark: "wrong", retry: null, revealed: false, can_retry: true, can_reveal: true, answer: null, why: null, ...over });
  it("reads marks; a work without marks gives null", () => {
    expect(parseResultView(base)!.marks).toBeNull();
    const v = parseResultView({ ...base, marks: [mark(), mark({ id: "q3", n: 3, mark: "right", can_retry: false, can_reveal: false, why: "Vì lý do" })] })!;
    expect(v.marks!.map((m) => [m.n, m.mark, m.canReveal, m.answer, m.why])).toEqual([[2, "wrong", true, null, null], [3, "right", false, null, "Vì lý do"]]);
  });
  it("a test never carries marks (the whole reply is refused), and unknown keys / totals are refused", () => {
    expect(parseResultView({ ...base, is_test: true, marks: [mark()] })).toBeNull();
    expect(parseResultView({ ...base, marks: [mark({ correct: 1 })] })).toBeNull();
    expect(parseResultView({ ...base, marks: [mark({ mark: "maybe" })] })).toBeNull();
    expect(parseResultView({ ...base, marks: [mark()], total: 8 })).toBeNull();
  });
});
