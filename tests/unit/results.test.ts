import { describe, expect, it } from "vitest";
import { buildActions, DESK_OPTIONS, PAGE_OPTIONS, RESULT_RULES, sessionCards, waitTone } from "@/lib/results/actions";
import { handledList, handledPredicate, handledThisWeek, latestByCard, type CardDecision } from "@/lib/results/decisions";
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
    // "Giao theo Unit" saves the Units of a Review row: the Review still keeps its own name (never scored as its first Unit).
    expect(unitKeyOf(["U13", "U14"], "Review 7")).toBe("Review 7");
    expect(unitKeyOf(["U21", "U22"], "Destination C1&C2 · Review 11 (Units 21–22)")).toBe("Review 11");
    expect(unitKeyOf(["U15"], "Destination C1, C2 - Unit 15 - A, B, C, E")).toBe("U15");
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
  const r1 = scoreWork(work({ instanceId: "i3", title: "Review 1", units: [], submittedAt: "2026-11-15T08:34:00Z", items: items("1100000000????????", "A", "so-sanh"), firstAttemptId: "t3", lastAttemptId: "t3", episodeId: "e3" }), TODAY);
  const works = [u15, wf, r1];
  const cards = buildActions({ learnerId: L, works, units: byUnit(works, RESULT_RULES.minItems), tags: byTag(works) });

  it("the grading card leads, red after 5 days, counts the questions and the missing feedback, opens the oldest test's questions", () => {
    expect(cards[0]).toMatchObject({ kind: "grade", tone: "red", facts: { works: 3, pendingItems: 9, feedbackMissing: 3, oldestDays: 11, title: "Review 1" }, href: `/learners/${L}/finish` }); // L1: the queue, oldest first
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

describe("a test given again (review 26/11)", () => {
  it("is shown but never counted: no Unit / tag total, no go-over / praise card; its pending questions still wait for grading", () => {
    const again = scoreWork(work({ instanceId: "g2", counted: false, items: [...items("0000000000", "E"), ...items("??", "A", "dang-tu", 11)] }), TODAY);
    expect(again.counted).toBe(false);
    const c = buildActions({ learnerId: L, works: [again], units: [], tags: [] }, PAGE_OPTIONS);
    expect(c.map((x) => x.kind)).toEqual(["grade"]);
    expect(c[0]!.href).toBe(`/learners/${L}/finish`);
  });
});

describe("Đã làm / Bỏ qua (PR-B): a marked card leaves until newer work feeds it", () => {
  const mk = (id: string, title: string, parts: [string, string][], at: string) =>
    scoreWork(work({ instanceId: id, title, units: [], submittedAt: at, items: parts.flatMap(([p, spec], k) => items(spec, p, k % 2 ? "thanh-ngu" : "dang-tu", 1 + k * 20)), lastAttemptId: `t-${id}`, episodeId: `e-${id}` }), TODAY);
  const works = [
    mk("u15", "Unit 15", [["A", "11111111111?"], ["B", "00000000"], ["E", "0000000000"]], "2026-11-24T04:53:00Z"),
    mk("wf", "Unit 14 - Word formation", [["M", "1110000000000"], ["N", "1111000000"]], "2026-11-20T15:56:00Z"),
    mk("r1", "Review 1", [["A", "1111111000"], ["C", "10000000"]], "2026-11-15T08:34:00Z"),
  ];
  const input = { learnerId: L, works, units: byUnit(works, RESULT_RULES.minItems), tags: byTag(works) };
  const mark = (cardKey: string, at: string, decision: "done" | "skipped" = "done", evidenceAt: string | null = null): CardDecision => ({
    cardKey, kind: cardKey.startsWith("fix") ? "fix_together" : cardKey.startsWith("tag") ? "practise" : cardKey.startsWith("unit") ? "unit_review" : "praise",
    label: cardKey, decision, reason: decision === "skipped" ? "đã chữa ngoài app" : null, byRole: "tutor", at, evidenceAt,
  });

  it("every card carries the time of its newest work; tags take the newest test that has them", () => {
    const all = buildActions(input, PAGE_OPTIONS);
    expect(all.find((c) => c.key === "fix-u15-E")?.evidenceAt).toBe("2026-11-24T04:53:00Z");
    expect(all.find((c) => c.key === "tag-dang-tu")?.evidenceAt).toBe("2026-11-24T04:53:00Z");
    expect(byTag(works).find((t) => t.key === "dang-tu")?.lastAt).toBe("2026-11-24T04:53:00Z");
  });
  it("a part gone over leaves the desk and the next weak part of the same test takes its place; other kinds keep their slot", () => {
    const isHandled = handledPredicate([mark("fix-u15-E", "2026-11-25T02:00:00Z")]);
    const d = buildActions(input, { ...DESK_OPTIONS, isHandled });
    const fix = d.filter((c) => c.kind === "fix_together").map((c) => c.key);
    expect(fix).not.toContain("fix-u15-E");
    expect(fix[0]).toBe("fix-u15-B");
    expect(d.map((c) => c.kind)).toEqual(["grade", "fix_together", "fix_together", "unit_review", "practise", "praise"]);
  });
  it("newer work brings the card back; the grade card can never be marked away", () => {
    const before = handledPredicate([mark("fix-u15-E", "2026-11-23T00:00:00Z"), mark("grade", "2026-11-26T00:00:00Z")]);
    const keys = buildActions(input, { ...PAGE_OPTIONS, isHandled: before }).map((c) => c.key);
    expect(keys).toContain("fix-u15-E"); // marked before the work of 24/11 came in
    expect(keys).toContain("grade");
  });
  it("the latest mark of a card wins; a marked praise lets the next strong part be praised", () => {
    expect(latestByCard([mark("tag-x", "2026-11-25T00:00:00Z", "skipped"), mark("tag-x", "2026-11-26T00:00:00Z")]).get("tag-x")?.decision).toBe("done");
    const praised = buildActions(input, PAGE_OPTIONS).find((c) => c.kind === "praise")!;
    const next = buildActions(input, { ...PAGE_OPTIONS, isHandled: handledPredicate([mark(praised.key, "2026-11-26T00:00:00Z")]) }).find((c) => c.kind === "praise");
    expect(next?.key).not.toBe(praised.key);
  });
  it("handled list: newest first, days after the work, cards brought back by newer work, the last 30 days only; 7-day count", () => {
    const rows = [
      mark("fix-u15-E", "2026-11-25T02:00:00Z", "done", "2026-11-24T04:53:00Z"),
      mark("tag-dang-tu", "2026-11-22T00:00:00Z", "skipped", "2026-11-20T15:56:00Z"),
      mark("unit-U9", "2026-10-01T00:00:00Z"),
    ];
    const list = handledList(rows, buildActions(input, PAGE_OPTIONS), TODAY);
    expect(list.map((i) => [i.cardKey, i.afterDays, i.reopened])).toEqual([["fix-u15-E", 0, false], ["tag-dang-tu", 1, true]]);
    expect(handledThisWeek(list, TODAY)).toBe(2);
    expect(handledThisWeek(list, "2026-12-05")).toBe(0);
  });
});

describe("PR-B after review: what the adult saw, waiting work, stable keys, windows", () => {
  const mk = (id: string, parts: [string, string][], at: string, units: string[] = []) =>
    scoreWork(work({ instanceId: id, title: id, units, submittedAt: at, items: parts.flatMap(([p, spec], k) => items(spec, p, "dang-tu", 1 + k * 20)), lastAttemptId: `t-${id}`, episodeId: `e-${id}` }), TODAY);
  const mark = (cardKey: string, at: string, evidenceAt: string | null): CardDecision => ({ cardKey, kind: "unit_review", label: cardKey, decision: "done", reason: null, byRole: "tutor", at, evidenceAt });

  it("work sent while the page was open is not hidden by the click: it is newer than what the card showed", () => {
    const works = [mk("a", [["A", "0001000000"]], "2026-11-25T11:00:00Z", ["U15"]), mk("b", [["A", "00000"]], "2026-11-25T12:05:00Z", ["U15"])];
    const card = buildActions({ learnerId: L, works, units: byUnit(works, 4), tags: [] }, PAGE_OPTIONS).find((c) => c.key === "unit-U15")!;
    expect(card.evidenceAt).toBe("2026-11-25T12:05:00Z");
    // She saw the card at 11:00's evidence and clicked at 12:10 (after the new work at 12:05).
    expect(handledPredicate([mark("unit-U15", "2026-11-25T12:10:00Z", "2026-11-25T11:00:00Z")])(card)).toBe(false);
    expect(handledPredicate([mark("unit-U15", "2026-11-25T12:10:00Z", "2026-11-25T12:05:00Z")])(card)).toBe(true);
    // A future evidence time sent by a client never hides later work: it is capped at the click.
    expect(handledPredicate([mark("unit-U15", "2026-11-25T12:00:00Z", "2026-11-26T12:00:00Z")])(card)).toBe(false);
  });
  it("work still waiting for the adult does not bring a Unit / knowledge-item card back", () => {
    const graded = mk("a", [["A", "0001000000"]], "2026-11-24T00:00:00Z", ["U15"]);
    const waiting = mk("b", [["A", "?????"]], "2026-11-25T00:00:00Z", ["U15"]);
    expect(byUnit([graded, waiting], 4)[0]!.lastAt).toBe("2026-11-24T00:00:00Z");
    expect(byTag([graded, waiting])[0]!.lastAt).toBe("2026-11-24T00:00:00Z");
  });
  it("a test with parts keeps per-part keys while the other parts are still being graded", () => {
    const early = mk("x", [["A", "1110000000"], ["B", "??????"]], "2026-11-24T00:00:00Z");
    const later = mk("x", [["A", "1110000000"], ["B", "000000"]], "2026-11-24T00:00:00Z");
    const keys = (w: ReturnType<typeof mk>) => buildActions({ learnerId: L, works: [w], units: [], tags: [] }, PAGE_OPTIONS).filter((c) => c.kind === "fix_together").map((c) => c.key);
    expect(keys(early)).toEqual(["fix-x-A"]);
    expect(keys(later)).toEqual(["fix-x-B", "fix-x-A"]);
  });
  it("'7 ngày qua' = today and the 6 days before (Vietnam days)", () => {
    const at = (iso: string) => ({ ...mark("k", iso, null), afterDays: null, reopened: false });
    expect(handledThisWeek([at("2026-11-19T17:00:00Z")], TODAY)).toBe(1); // 20/11 00:00 in Vietnam
    expect(handledThisWeek([at("2026-11-19T16:59:00Z")], TODAY)).toBe(0); // 19/11 23:59 in Vietnam
  });
});
