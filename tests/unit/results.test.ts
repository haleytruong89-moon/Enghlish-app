import { describe, expect, it } from "vitest";
import { buildActions, DESK_OPTIONS, PAGE_OPTIONS, RESULT_RULES, sessionCards, waitTone } from "@/lib/results/actions";
import { byTag, byUnit, partLabel, pct, scoreItems, scoreWork, unitKeyOf, type ItemMeta, type ItemRow, type WorkInput } from "@/lib/results/score";

const L = "f0000000-0000-4000-8000-00000000b001";
const TODAY = "2026-11-26";
const items = (spec: string, part = "A", tag: string | null = "dang-tu", from = 1): ItemRow[] =>
  [...spec].map((ch, i) => ({ id: `q${from + i}`, n: from + i, part, tag, kind: "gap", state: ch === "1" ? "correct" : ch === "0" ? "incorrect" : ch === "b" ? "blank" : "pending" }));
const work = (o: Partial<WorkInput> & { items: ItemRow[] }): WorkInput => ({
  instanceId: "i1", activityId: "a1", title: "Destination C1, C2 - Unit 15 - A, B, C, E", units: ["U15"], submittedAt: "2026-11-24T04:53:00Z", attempts: 1,
  firstAttemptId: "t1", lastAttemptId: "t1", episodeId: "e1", feedbackGiven: false, feedbackReady: true, official: null, partNames: new Map([["A", "Adjectives and adverbs"], ["E", "Comparatives"]]), ...o,
});

describe("scoreItems: the questions of one first attempt as they stand", () => {
  const meta = new Map<string, ItemMeta>([["q1", { n: 1, part: "A", tag: "dang-tu", outOfApp: false }], ["q2", { n: 2, part: "A", tag: "dang-tu", outOfApp: false }], ["q3", { n: 3, part: "B", tag: null, outOfApp: true }], ["q4", { n: 4, part: "B", tag: "so-sanh", outOfApp: false }]]);
  it("app check wins; a question left to a person takes the adult's decision, else stays pending; paper-only questions are left out", () => {
    const checks = { items: { q1: { kind: "gap", result: "correct" }, q2: { kind: "short", result: "needs_person" }, q3: { kind: "gap", result: "incorrect" }, q4: { kind: "transform", result: "needs_person" } } };
    const rows = scoreItems(checks, new Map([["q2", "correct" as const]]), meta);
    expect(rows.map((r) => [r.id, r.state, r.part, r.tag])).toEqual([["q1", "correct", "A", "dang-tu"], ["q2", "correct", "A", "dang-tu"], ["q4", "pending", "B", "so-sanh"]]);
    expect(scoreItems(null, new Map(), meta)).toEqual([]);
  });
});

describe("scoreWork / units / tags", () => {
  it("a blank counts as not right; pending is apart; parts and tags have their own tallies; waiting days in Vietnam days", () => {
    const w = scoreWork(work({ items: [...items("1111111111b?", "A"), ...items("0000000000", "E", "so-sanh", 31)] }), TODAY);
    expect(w.tally).toEqual({ correct: 10, decided: 21, pending: 1 });
    expect(w.parts.map((p) => [p.key, p.name, p.tally])).toEqual([["A", "A · Adjectives and adverbs", { correct: 10, decided: 11, pending: 1 }], ["E", "E · Comparatives", { correct: 0, decided: 10, pending: 0 }]]);
    expect(w.unitKey).toBe("U15");
    expect(w.waitingDays).toBe(2);
    expect(w.needsAdult).toBe(true);
    expect(pct(w.tally)).toBe(48);
  });
  it("unitKeyOf: Units given first, else the title; Reviews and Progress Tests keep their own name", () => {
    expect(unitKeyOf([], "Destination C1&C2 · Unit 14 · Idioms (L)")).toBe("U14");
    expect(unitKeyOf([], "Destination C1&C2 · Review 11 (Units 21–22)")).toBe("Review 11");
    expect(unitKeyOf([], "Destination C1 C2 Review 1")).toBe("Review 1");
    expect(unitKeyOf([], "Destination C1&C2 · Progress Test 2 (Units 13–26) · Phần 1 (A–G)")).toBe("Progress Test 2");
    expect(unitKeyOf(["U13", "U14"], "Review 7")).toBe("U13");
    expect(unitKeyOf([], "Tuần 1 — Bài tập về nhà")).toBeNull();
  });
  it("byUnit sums the tests of a Unit, names the weakest part, orders U1…U26 then Reviews; byTag goes weakest first", () => {
    const a = scoreWork(work({ instanceId: "a", title: "Unit 14 - Word formation", units: [], items: items("1110000000000", "M", "dang-tu") }), TODAY);
    const b = scoreWork(work({ instanceId: "b", title: "Unit 14 · Idioms (L)", units: [], items: items("111111110000", "L", "thanh-ngu") }), TODAY);
    const c = scoreWork(work({ instanceId: "c", title: "Review 1", units: [], items: items("1111", "A", "dang-tu") }), TODAY);
    const u = byUnit([c, a, b], RESULT_RULES.minItems);
    expect(u.map((x) => [x.key, x.works, x.tally.correct, x.tally.decided])).toEqual([["U14", 2, 11, 25], ["Review 1", 1, 4, 4]]);
    expect(u[0]!.weakest).toMatchObject({ title: "Unit 14 - Word formation", part: { key: "M" } });
    expect(byTag([a, b, c]).map((t) => [t.key, t.works, t.tally.correct, t.tally.decided])).toEqual([["dang-tu", 2, 7, 17], ["thanh-ngu", 1, 8, 12]]);
  });
});

describe("Việc nên làm: rules approved 25/11 (50 / 60 / 80 %, 2 / 5 days)", () => {
  // The real picture of 25/11 in miniature: U15 part E 0/10, Word formation 3/13, a strong part A, work waiting for the tutor.
  const u15 = scoreWork(work({ items: [...items("11111111111?", "A"), ...items("0000000000", "E", "so-sanh", 31)] }), TODAY);
  const wf = scoreWork(work({ instanceId: "i2", title: "Unit 14 - Word formation", units: [], submittedAt: "2026-11-20T15:56:00Z", feedbackGiven: false, items: items("1110000000000", "M", "dang-tu"), partNames: new Map(), official: { correct: 3, total: 13 }, lastAttemptId: "t2", episodeId: "e2" }), TODAY);
  const r1 = scoreWork(work({ instanceId: "i3", title: "Review 1", units: [], submittedAt: "2026-11-15T08:34:00Z", items: items("1100000000????????", "A", "so-sanh"), lastAttemptId: "t3", episodeId: "e3" }), TODAY);
  const works = [u15, wf, r1];
  const cards = buildActions({ learnerId: L, works, units: byUnit(works, RESULT_RULES.minItems), tags: byTag(works) });

  it("the grading card leads, red after 5 days, counts the questions and the missing feedback, opens the oldest test's questions", () => {
    expect(cards[0]).toMatchObject({ kind: "grade", tone: "red", facts: { works: 3, pendingItems: 9, feedbackMissing: 3, oldestDays: 11, title: "Review 1" }, href: `/review/studio?learner=${L}#studio-t3` });
    expect([waitTone(0), waitTone(2), waitTone(4), waitTone(5)]).toEqual(["info", "amber", "amber", "red"]);
  });
  it("go over the weakest part with the child (part E 0/10 before Word formation 3/13); only parts with ≥ 4 decided questions", () => {
    const fix = cards.filter((c) => c.kind === "fix_together");
    expect(fix[0]).toMatchObject({ tone: "red", facts: { part: "E · Comparatives", correct: 0, decided: 10, percent: 0 }, href: `/learners/${L}/notes/new#goi-y-buoi-hoc` });
    const page = buildActions({ learnerId: L, works, units: [], tags: [] }, PAGE_OPTIONS).filter((c) => c.kind === "fix_together");
    expect(page.map((c) => c.facts.title)).toContain("Unit 14 - Word formation");
  });
  it("at most 6 cards on the desk, one kept for praise (part A 11/11)", () => {
    expect(cards.length).toBeLessThanOrEqual(RESULT_RULES.maxCards);
    expect(cards.at(-1)).toMatchObject({ kind: "praise", tone: "good", facts: { part: "A · Adjectives and adverbs", correct: 11, decided: 11 } });
  });
  it("practice card: a knowledge item below 60 % across ≥ 2 tests; never for one test only", () => {
    const all = buildActions({ learnerId: L, works, units: [], tags: byTag(works) }, PAGE_OPTIONS);
    // so-sanh: U15 part E 0/10 + Review 1 2/10 = 10 %; dang-tu: U15 part A 11/11 + Word formation 3/13 = 14/24 = 58 %. Weakest first.
    expect(all.filter((c) => c.kind === "practise").map((c) => [c.facts.tag, c.facts.percent])).toEqual([["so-sanh", 10], ["dang-tu", 58]]);
    const one = scoreWork(work({ instanceId: "x", items: items("0000000000", "A", "thanh-ngu") }), TODAY);
    expect(buildActions({ learnerId: L, works: [one], units: [], tags: byTag([one]) }, PAGE_OPTIONS).some((c) => c.kind === "practise")).toBe(false);
  });
  it("Unit card below 60 %; session cards are the ones to do in a lesson", () => {
    const all = buildActions({ learnerId: L, works, units: byUnit(works, RESULT_RULES.minItems), tags: byTag(works) }, PAGE_OPTIONS);
    // A Review is itself the going back: only book Units get "học kỹ lại"; weakest first.
    expect(all.filter((c) => c.kind === "unit_review").map((c) => c.facts.unit)).toEqual(["U14", "U15"]);
    expect(sessionCards(all).every((c) => ["fix_together", "unit_review", "practise"].includes(c.kind))).toBe(true);
  });
  it("nothing sent: no card at all", () => {
    expect(buildActions({ learnerId: L, works: [], units: [], tags: [] })).toEqual([]);
  });
  it("old work (> 21 days) makes no fix / praise card, but still waits for grading", () => {
    const old = scoreWork(work({ submittedAt: "2026-10-01T00:00:00Z", items: items("0000000000", "A") }), TODAY);
    const c = buildActions({ learnerId: L, works: [old], units: [], tags: [] });
    expect(c.map((x) => x.kind)).toEqual(["grade"]);
  });
});

describe("desk caps (26/11, after running the rules on the real data of 25/11)", () => {
  // 5 tests with many weak parts: the desk must still show every kind of action, one weak part per test.
  const mk = (id: string, title: string, parts: [string, string][], at: string) =>
    scoreWork(work({ instanceId: id, title, units: [], submittedAt: at, items: parts.flatMap(([p, spec], k) => items(spec, p, k % 2 ? "thanh-ngu" : "dang-tu", 1 + k * 20)), lastAttemptId: `t-${id}`, episodeId: `e-${id}` }), TODAY);
  const works = [
    mk("u15", "Unit 15", [["A", "11111111111?"], ["B", "00000000"], ["E", "0000000000"]], "2026-11-24T04:53:00Z"),
    mk("wf", "Unit 14 - Word formation", [["M", "1110000000000"], ["N", "1111000000"]], "2026-11-20T15:56:00Z"),
    mk("r1", "Review 1", [["A", "1111111000"], ["C", "10000000"]], "2026-11-15T08:34:00Z"),
  ];
  const all = { learnerId: L, works, units: byUnit(works, RESULT_RULES.minItems), tags: byTag(works) };
  it("grade first; at most 2 'go over it' cards, from different tests, the bigger 0 % part first; then a Unit, a practice, a praise", () => {
    const d = buildActions(all, DESK_OPTIONS);
    expect(d.map((c) => c.kind)).toEqual(["grade", "fix_together", "fix_together", "unit_review", "practise", "praise"]);
    expect(d.filter((c) => c.kind === "fix_together").map((c) => [c.facts.title, c.facts.part])).toEqual([["Unit 15", "E · Comparatives"], ["Review 1", "C"]]);
  });
  it("the page lists every card (no caps)", () => {
    expect(buildActions(all, PAGE_OPTIONS).filter((c) => c.kind === "fix_together").length).toBeGreaterThan(2);
  });
  it("partLabel keeps short names, cuts long ones at a word, does not repeat the key", () => {
    expect(partLabel("A", "Adjectives and adverbs")).toBe("A · Adjectives and adverbs");
    expect(partLabel("H", "H · Phrases, patterns and collocations · tr.116")).toBe("H · Phrases, patterns and collocations…");
    expect(partLabel("E", "Complete with an appropriate comparative or superlative form of the words in the box.")).toBe("E · Complete with an appropriate…");
    expect(partLabel("C", "C")).toBe("C");
  });
});
