import { describe, expect, it } from "vitest";
import { computeTargetState, hadHelp } from "@/lib/engine/computeTargetState";
import { daysSinceLastPractice, vnDay } from "@/lib/engine/days";
import { evidenceKeyOf } from "@/lib/engine/key";
import { projectDecisions } from "@/lib/engine/project";
import { ENGINE_VERSION, SKILL_STATES, STATE_LEVEL, stateAt, type Exposure } from "@/lib/engine/types";
import { AP02, auto, decision, ep, exposure, input, type AutoOpts, type EpOpts } from "./fixtures/engine";

describe("engine types", () => {
  it("5 states in order, levels 0..4, stateAt clamps", () => {
    expect(SKILL_STATES).toEqual(["NOT_OBSERVED", "SUPPORTED", "DEVELOPING", "INDEPENDENT", "TRANSFERABLE"]);
    expect(SKILL_STATES.map((s) => STATE_LEVEL[s])).toEqual([0, 1, 2, 3, 4]);
    expect([stateAt(-1), stateAt(2), stateAt(9)]).toEqual(["NOT_OBSERVED", "DEVELOPING", "TRANSFERABLE"]);
    expect(ENGINE_VERSION).toMatch(/^[A-Za-z0-9][A-Za-z0-9.-]{0,19}$/); // same CHECK as mastery_decisions.engine_version
  });
});

describe("evidenceKeyOf (D13)", () => {
  it("is order-free and duplicate-free, has the SQL format, and changes when one id is added", () => {
    expect(evidenceKeyOf([])).toBe("0-cbf29ce484222325"); // FNV-1a 64 offset basis
    expect(evidenceKeyOf(["a"])).toBe("1-af63dc4c8601ec8c"); // FNV-1a 64 test vector of "a"
    expect(evidenceKeyOf(["b", "a", "a"])).toBe(evidenceKeyOf(["a", "b"]));
    expect(evidenceKeyOf(["a", "b", "c"])).not.toBe(evidenceKeyOf(["a", "b"]));
    expect(evidenceKeyOf(["x".repeat(500)])).toMatch(/^[0-9]{1,6}-[0-9a-f]{16}$/);
  });
});

describe("Vietnamese days (D7) and the delayed-check gap (D8)", () => {
  it("vnDay changes at midnight in Vietnam, not in UTC", () => {
    expect(vnDay("2026-10-22T16:59:59Z")).toBe(vnDay("2026-10-22T00:00:00Z")); // 23:59:59 on 22/10 in Vietnam
    expect(vnDay("2026-10-22T17:00:00Z")).toBe(vnDay("2026-10-22T00:00:00Z") + 1); // 00:00 on 23/10 in Vietnam
  });

  it("counts from the latest practice of the same topic before the work, ignoring the work's own exposure", () => {
    const at = exposure(3).at;
    expect(daysSinceLastPractice([exposure(20), exposure(17), exposure(3, "A-W1-VOLCANOES", "self")], at, "self", "A-W1-VOLCANOES")).toBe(14);
    expect(daysSinceLastPractice([exposure(20), exposure(1)], at, "self", "A-W1-VOLCANOES")).toBe(17); // later practice is not "before"
  });

  it("a lesson (no topic) counts for every topic; another topic counts only when the topic itself has no practice; none → null", () => {
    const at = exposure(3).at;
    expect(daysSinceLastPractice([exposure(20), exposure(10, null)], at, "x", "A-W1-VOLCANOES")).toBe(7);
    expect(daysSinceLastPractice([exposure(20), exposure(5, "A-W2-WATERCYCLE")], at, "x", "A-W1-VOLCANOES")).toBe(17);
    expect(daysSinceLastPractice([exposure(9, "A-W2-WATERCYCLE")], at, "x", "A-W1-VOLCANOES")).toBe(6);
    expect(daysSinceLastPractice([exposure(9, "A-W2-WATERCYCLE")], at, "x", null)).toBe(6); // route 2: any topic
    expect(daysSinceLastPractice([], at, "x", "A-W1-VOLCANOES")).toBeNull();
  });
});

describe("projectDecisions (mirror of english.eng_project_skill_state)", () => {
  it("no decision → Chưa đủ bài, nothing open", () => {
    expect(projectDecisions([])).toMatchObject({ state: "NOT_OBSERVED", stateSince: null, stateDecisionId: null, openProposal: null, openFlag: null });
  });

  it("the state is the latest AUTO / CONFIRMED / MANUAL by seq (not by array order); REJECTED and PROPOSED never set it", () => {
    const a1 = decision("AUTO", "SUPPORTED", { daysAgo: 20 });
    const a2 = decision("AUTO", "DEVELOPING", { daysAgo: 15 });
    const p = decision("PROPOSED", "INDEPENDENT", { daysAgo: 10 });
    const r = decision("REJECTED", "DEVELOPING", { daysAgo: 9, respondsTo: p.id });
    const proj = projectDecisions([r, p, a2, a1]);
    expect(proj).toMatchObject({ state: "DEVELOPING", stateSince: a2.createdAt, stateDecisionId: a2.id, openProposal: null });
    expect([...proj.proposalKeys]).toEqual([p.evidenceKey]);
  });

  it("an unanswered PROPOSED / FLAG is open; CONFIRMED of a proposal moves the state; CONFIRMED of a ⚑ keeps it but restarts stateSince", () => {
    const a = decision("AUTO", "DEVELOPING", { daysAgo: 20 });
    const p = decision("PROPOSED", "INDEPENDENT", { daysAgo: 10 });
    const f = decision("FLAG", "DEVELOPING", { daysAgo: 8, fromState: "DEVELOPING" });
    expect(projectDecisions([a, p, f])).toMatchObject({ state: "DEVELOPING", openProposal: { id: p.id }, openFlag: { id: f.id } });
    const keep = decision("CONFIRMED", "DEVELOPING", { daysAgo: 7, respondsTo: f.id, fromState: "DEVELOPING" });
    const yes = decision("CONFIRMED", "INDEPENDENT", { daysAgo: 6, respondsTo: p.id, fromState: "DEVELOPING" });
    const after = projectDecisions([a, p, f, keep, yes]);
    expect(after).toMatchObject({ state: "INDEPENDENT", stateSince: yes.createdAt, openProposal: null, openFlag: null });
    expect([...after.flagKeys]).toEqual([f.evidenceKey]);
    expect(projectDecisions([a, f, keep]).stateSince).toBe(keep.createdAt);
  });

  it("a MANUAL after a confirmed level wins (a person may correct it, G3)", () => {
    const c = decision("CONFIRMED", "INDEPENDENT", { daysAgo: 10, respondsTo: "md-x" });
    const m = decision("MANUAL", "DEVELOPING", { daysAgo: 2, fromState: "INDEPENDENT" });
    expect(projectDecisions([m, c]).state).toBe("DEVELOPING");
  });
});

const run = computeTargetState;
const ids = (xs: { episodeId: string }[]) => xs.map((x) => x.episodeId);
const conditionIds = (r: ReturnType<typeof run>) => r.conditions.map((c) => c.id);
const condition = (r: ReturnType<typeof run>, id: string) => r.conditions.find((c) => c.id === id)!;

/** Three unaided first attempts: Vietnamese days 10, 6, 2 (span 8), topics A-W1 + A-W2, the first one an in-session test. */
const three = (d: [number, number, number] = [10, 6, 2], o: [EpOpts?, EpOpts?, EpOpts?] = []) => [
  ep({ daysAgo: d[0], contextId: "A-W1-VOLCANOES", facets: { checkpoint: true }, ...o[0] }),
  ep({ daysAgo: d[1], contextId: "A-W2-WATERCYCLE", score: 4, ...o[1] }),
  ep({ daysAgo: d[2], contextId: "A-W2-WATERCYCLE", ...o[2] }),
];
const NOTES = { kind: "notes", verification: "declared" as const };
const decided = (...ds: ReturnType<typeof decision>[]) => ds;
/** Current state Tự làm được (AUTO 2 → PROPOSED 3 → CONFIRMED). */
function confirmedIndependent() {
  const a = decision("AUTO", "DEVELOPING", { daysAgo: 45 });
  const p = decision("PROPOSED", "INDEPENDENT", { daysAgo: 40, fromState: "DEVELOPING" });
  const c = decision("CONFIRMED", "INDEPENDENT", { daysAgo: 39, respondsTo: p.id, fromState: "DEVELOPING" });
  return decided(a, p, c);
}

describe("levels 1–2 and what counts as help (D4, D5)", () => {
  it("no evidence: Chưa đủ bài and nothing to write", () => {
    const r = run(input());
    expect(r).toMatchObject({ currentState: "NOT_OBSERVED", evidenceState: "NOT_OBSERVED", proposedState: "NOT_OBSERVED", route: null, auto: null, propose: null, raiseFlag: false });
    expect(r.conditions.every((c) => !c.met || c.need === 0)).toBe(true);
  });

  it("'không có cơ hội thể hiện' (NULL) and a lone 0/4 never count (NULL ≠ 0)", () => {
    expect(run(input({ episodes: [ep({ score: null }), ep({ score: 0 })] })).evidenceState).toBe("NOT_OBSERVED");
  });

  it.each([
    ["declared help (notes)", { assistance: [NOTES] }],
    ["help the tutor saw (frame)", { assistance: [{ kind: "frame", verification: "observed" as const }] }],
    ["paper work with unknown help (UAT-06)", { declaredUnknown: true }],
    ["a PRACTICE step ('Luyện tập (có gợi ý)')", { mode: "PRACTICE" as const }],
    ["an S6 revision: never a first attempt (FR-14a)", { mode: "REVISION" as const, isFirstAttempt: false, facets: { revision: true }, assistance: [{ kind: "tutor_prompt", verification: "observed" as const }] }],
    ["a retry in the same learning family", { isFirstAttempt: false }],
  ])("%s at 4/4 is only 'Làm được khi có gợi ý' (AUTO, no proposal)", (_name, o) => {
    const e = ep({ score: 4, ...o });
    const r = run(input({ episodes: [e] }));
    expect(r).toMatchObject({ evidenceState: "SUPPORTED", auto: "SUPPORTED", propose: null, route: 1 });
    expect(r.evidence.auto).toEqual([e.episodeId]);
  });

  it("an unaided first attempt at 3/4 is 'Đang tiến bộ' (AP-0.3 developing.minScore = minScoreEach, G1); at 2/4 it is level 1", () => {
    expect(run(input({ episodes: [ep({ score: 3 })] }))).toMatchObject({ evidenceState: "DEVELOPING", auto: "DEVELOPING" });
    expect(run(input({ episodes: [ep({ score: 2 })] }))).toMatchObject({ evidenceState: "SUPPORTED", auto: "SUPPORTED" });
  });

  it("hadHelp: unaided INDEPENDENT_CHECK is not help; every D4 case is", () => {
    const base = { mode: "INDEPENDENT_CHECK" as const, facets: ep().facets, assistance: [], declaredUnknown: false };
    expect(hadHelp(base, ["INDEPENDENT_CHECK"], 0, true)).toBe(false);
    expect(hadHelp({ ...base, assistance: [NOTES] }, ["INDEPENDENT_CHECK"], 0, true)).toBe(true);
    expect(hadHelp({ ...base, assistance: [NOTES] }, ["INDEPENDENT_CHECK"], 1, true)).toBe(false); // maxAssistance is config
    expect(hadHelp({ ...base, declaredUnknown: true }, ["INDEPENDENT_CHECK"], 0, true)).toBe(true);
    expect(hadHelp({ ...base, mode: "PRACTICE" }, ["INDEPENDENT_CHECK"], 0, true)).toBe(true);
    expect(hadHelp({ ...base, mode: "PRACTICE" }, ["PRACTICE", "INDEPENDENT_CHECK"], 0, true)).toBe(false);
    expect(hadHelp({ ...base, facets: { ...base.facets, revision: true } }, ["INDEPENDENT_CHECK"], 0, true)).toBe(true);
  });
});

describe("level 3 · route 1 (D22, DESIGN §8 counting rules)", () => {
  it("3 unaided first attempts on 3 days, 2 topics, span ≥ 7, one in-session test → AUTO 'Đang tiến bộ' + PROPOSED 'Tự làm được' (D14)", () => {
    const eps = three();
    const r = run(input({ episodes: eps }));
    expect(r).toMatchObject({ evidenceState: "INDEPENDENT", proposedState: "INDEPENDENT", route: 1, auto: "DEVELOPING", propose: "INDEPENDENT" });
    expect(r.evidence.propose).toEqual(ids(eps));
    expect(["r1_first_attempts", "r1_contexts", "r1_span_days", "r1_direct_checkpoint"].map((id) => [condition(r, id).have, condition(r, id).need, condition(r, id).met])).toEqual([
      [3, 3, true], [2, 2, true], [8, 7, true], [1, 1, true],
    ]);
  });

  it.each([
    ["span exactly 7 days counts", () => three([9, 5, 2]), "INDEPENDENT"],
    ["span 6 days does not", () => three([8, 5, 2]), "DEVELOPING"],
    ["two of them on the same Vietnamese day: only 2 distinct days", () => three([10, 2, 2]), "DEVELOPING"],
    ["one topic only (2 vs 1 bối cảnh)", () => three(undefined, [{}, { contextId: "A-W1-VOLCANOES" }, { contextId: "A-W1-VOLCANOES" }]), "DEVELOPING"],
    ["no in-session test and nothing watched live", () => three(undefined, [{ facets: {} }]), "DEVELOPING"],
    ["work the tutor watched live is a direct check (D6)", () => three(undefined, [{ facets: {}, observedDirectly: true }]), "INDEPENDENT"],
    ["one of the three had help (UAT-10)", () => three(undefined, [{}, {}, { assistance: [NOTES] }]), "DEVELOPING"],
    ["one of the three is 2/4", () => three(undefined, [{}, {}, { score: 2 }]), "DEVELOPING"],
    ["a baseline step never counts for level 3 (DESIGN §8)", () => three(undefined, [{ facets: { checkpoint: true, baseline: true } }]), "DEVELOPING"],
    ["a revision never counts (FR-14a)", () => three(undefined, [{}, {}, { mode: "REVISION", isFirstAttempt: false, facets: { revision: true } }]), "DEVELOPING"],
  ])("%s", (_name, episodes, expected) => {
    expect(run(input({ episodes: episodes() })).evidenceState).toBe(expected);
  });
});

describe("level 3 · route 2 (P3-b, receptiveAuto of AP-0.3)", () => {
  /** Quiz attempts 30 / 20 / 2 days ago (each 3 right + 1 wrong = 75 %), on 3 activities; exposures as S4 writes them. */
  function readingSet(o: { a1Ago?: number; lastPracticeAgo?: number; a1?: AutoOpts; a2?: AutoOpts; review?: AutoOpts } = {}) {
    const a1Ago = o.a1Ago ?? 30;
    const a2Ago = o.lastPracticeAgo ?? 20;
    const a1 = auto({ daysAgo: a1Ago, correct: 3, wrong: 1, activityId: "quiz-1", ...o.a1 });
    const a2 = auto({ daysAgo: a2Ago, correct: 3, wrong: 1, activityId: "quiz-2", ...o.a2 });
    const r = auto({ daysAgo: 2, correct: 3, wrong: 1, activityId: "quiz-3", ...o.review });
    const exposures: Exposure[] = [
      exposure(a1Ago, "A-W1-VOLCANOES", a1.attemptId),
      exposure(a2Ago, "A-W2-WATERCYCLE", a2.attemptId),
      exposure(2, "A-W3-EARTHQUAKES", r.attemptId),
    ];
    return input({ targetKey: "A-T1-TEXT-R", domain: "reading", autoAttempts: [a1, a2, r], exposures });
  }
  /** Exactly 8 items, all right (to show that dropping one attempt breaks "≥ 8 câu"). */
  const eight = (a2: AutoOpts = {}) => readingSet({ a1: { correct: 3, wrong: 0 }, a2: { correct: 3, wrong: 0, ...a2 }, review: { correct: 2, wrong: 0 } });

  it("12 items on 3 activities, exactly 75 %, a review 18 days after the last practice at 75 % → PROPOSED 'Tự làm được' by route 2", () => {
    const r = run(readingSet());
    expect(r).toMatchObject({ evidenceState: "INDEPENDENT", route: 2, auto: "DEVELOPING", propose: "INDEPENDENT" });
    expect(["r2_items", "r2_activities", "r2_accuracy", "r2_review"].map((id) => [condition(r, id).have, condition(r, id).need, condition(r, id).met])).toEqual([
      [12, 8, true], [3, 2, true], [75, 75, true], [1, 1, true],
    ]);
    expect(r.evidence.auto).toEqual(r.evidence.propose); // the AUTO to level 2 cites the route-2 evidence (D14)
  });

  it.each([
    ["7 items is not enough", () => readingSet({ a1: { correct: 2, wrong: 0 }, a2: { correct: 2, wrong: 0 }, review: { correct: 3, wrong: 0 } }), "DEVELOPING"], // 7 items at 100 % lift level 2 (G2) but not level 3
    ["exactly 8 items is enough", () => eight(), "INDEPENDENT"],
    ["one activity only", () => readingSet({ a1: { activityId: "quiz-1" }, a2: { activityId: "quiz-1" }, review: { activityId: "quiz-1" } }), "DEVELOPING"],
    ["a blank answer counts as wrong: 9/13 = 69 %", () => readingSet({ a2: { blank: 1 } }), "SUPPORTED"],
    ["a review exactly 14 days after the last practice counts", () => readingSet({ a1Ago: 20, lastPracticeAgo: 16 }), "INDEPENDENT"],
    ["13 days does not", () => readingSet({ a1Ago: 20, lastPracticeAgo: 15 }), "DEVELOPING"],
    ["a delayed_check step is a review without the 14-day gap", () => readingSet({ a1Ago: 20, lastPracticeAgo: 3, review: { facets: { delayedCheck: true } } }), "INDEPENDENT"],
    ["a review below 70 % is not a review", () => readingSet({ a1: { correct: 4, wrong: 0 }, a2: { correct: 4, wrong: 0 }, review: { correct: 2, wrong: 1 } }), "DEVELOPING"],
    ["a retry is not counted", () => eight({ isFirstAttempt: false }), "DEVELOPING"], // 5 counted items still reach level 2
    ["help on the attempt is not counted", () => eight({ assistance: [{ kind: "external_declared", verification: "declared" }] }), "DEVELOPING"],
    ["unknown help is not counted", () => eight({ declaredUnknown: true }), "DEVELOPING"],
    ["a revision is not counted", () => eight({ mode: "REVISION" }), "DEVELOPING"],
    ["a PRACTICE step is counted (receptiveAuto.allowedModes)", () => eight({ mode: "PRACTICE" }), "INDEPENDENT"],
  ])("%s", (_name, make, expected) => {
    expect(run(make()).evidenceState).toBe(expected);
  });

  it("G2 boundaries: 4 counted items at 75 % reach level 2 (AUTO, no proposal); 3 items or 74 % stay level 1", () => {
    const only = (o: AutoOpts) => input({ targetKey: "A-T1-TEXT-R", domain: "reading", autoAttempts: [auto({ activityId: "quiz-1", ...o })] });
    const four = run(only({ correct: 3, wrong: 1 }));
    expect(four).toMatchObject({ evidenceState: "DEVELOPING", auto: "DEVELOPING", propose: null, route: 1 });
    expect(["l2_auto_items", "l2_auto_accuracy"].map((id) => [condition(four, id).have, condition(four, id).need, condition(four, id).met])).toEqual([
      [4, 4, true], [75, 75, true],
    ]);
    expect(four.evidence.auto).toHaveLength(1);
    expect(run(only({ correct: 3 }))).toMatchObject({ evidenceState: "SUPPORTED", auto: "SUPPORTED" }); // 3 items < 4
    // 74 %: 37 right of 50 = 74 %; 75 %: 3 of 4
    expect(run(only({ correct: 37, wrong: 13 }))).toMatchObject({ evidenceState: "SUPPORTED", auto: "SUPPORTED" });
    expect(run(only({ correct: 38, wrong: 12 }))).toMatchObject({ evidenceState: "DEVELOPING", auto: "DEVELOPING" });
    expect(run(only({ correct: 0, wrong: 6 }))).toMatchObject({ evidenceState: "NOT_OBSERVED", auto: null }); // no right answer at all
  });

  it("G2: level 2 from items never needs a person; level 3 still needs route 2 or route 1", () => {
    const r = run(input({ targetKey: "A-T1-TEXT-R", domain: "reading", autoAttempts: [auto({ correct: 4, wrong: 0 })] }));
    expect(r).toMatchObject({ propose: null, proposedState: "DEVELOPING" });
  });

  it("a writing skill never uses route 2 (nor G2), and neither does AP-0.2 (no receptiveAuto)", () => {
    const writing = run({ ...readingSet(), domain: "writing" });
    expect(writing.evidenceState).toBe("NOT_OBSERVED");
    expect(conditionIds(writing).some((id) => id.startsWith("r2_"))).toBe(false);
    const old = run({ ...readingSet(), policy: AP02 });
    expect(old.evidenceState).toBe("NOT_OBSERVED");
    expect(conditionIds(old).some((id) => id.startsWith("r2_"))).toBe(false);
  });

  it("when both routes are met, route 1 is reported and cited", () => {
    const eps = three();
    const r = run({ ...readingSet(), episodes: eps });
    expect(r).toMatchObject({ route: 1, propose: "INDEPENDENT" });
    expect(r.evidence.propose).toEqual(ids(eps));
  });
});

describe("level 4 'Vận dụng được' (§1 item 4, D8, D10)", () => {
  /** Current Tự làm được; a delayed check on A-W3 (3 days ago) and a transfer check on a new topic (2 days ago), both 3/4 unaided. */
  function level4(o: { practiceAgo?: number; extra?: Exposure[]; decisions?: ReturnType<typeof confirmedIndependent> } = {}) {
    const d = ep({ daysAgo: 3, contextId: "A-W3-EARTHQUAKES", facets: { delayedCheck: true, checkpoint: true } });
    const t = ep({ daysAgo: 2, contextId: "A-W5-NEWTOPIC", facets: { transferCheck: true } });
    const exposures = [exposure(o.practiceAgo ?? 17, "A-W3-EARTHQUAKES"), exposure(3, "A-W3-EARTHQUAKES", d.attemptId), exposure(2, "A-W5-NEWTOPIC", t.attemptId), ...(o.extra ?? [])];
    return { d, t, inp: input({ episodes: [d, t], decisions: o.decisions ?? confirmedIndependent(), exposures }) };
  }

  it("Tự làm được + a delayed check exactly 14 days after the last practice on that topic + a transfer check → PROPOSED 'Vận dụng được'", () => {
    const { d, t, inp } = level4();
    const r = run(inp);
    expect(r).toMatchObject({ currentState: "INDEPENDENT", evidenceState: "TRANSFERABLE", proposedState: "TRANSFERABLE", route: 1, auto: null, propose: "TRANSFERABLE" });
    expect(r.evidence.propose).toEqual([d.episodeId, t.episodeId]);
  });

  it.each([
    ["13 days after the last practice on that topic is not a delayed check", { practiceAgo: 16 }],
    ["a lesson in between (no topic) restarts the gap", { extra: [exposure(10, null)] }],
  ])("%s", (_name, o) => {
    const r = run(level4(o).inp);
    expect(r).toMatchObject({ evidenceState: "DEVELOPING", proposedState: "INDEPENDENT", propose: null });
  });

  it("practice on ANOTHER topic does not restart the gap when the topic itself has practice", () => {
    expect(run(level4({ extra: [exposure(5, "A-W1-VOLCANOES")] }).inp).propose).toBe("TRANSFERABLE");
  });

  it("one episode marked both delayed and transfer is not enough: two different episodes (minDistinctEpisodes)", () => {
    const both = ep({ daysAgo: 3, contextId: "A-W3-EARTHQUAKES", facets: { delayedCheck: true, transferCheck: true } });
    const r = run(input({ episodes: [both], decisions: confirmedIndependent(), exposures: [exposure(17, "A-W3-EARTHQUAKES")] }));
    expect(condition(r, "l4_delayed").met).toBe(true);
    expect(condition(r, "l4_transfer").met).toBe(false);
    expect(r.propose).toBeNull();
  });

  it("without a confirmed 'Tự làm được' the same evidence never proposes level 4", () => {
    const r = run(level4({ decisions: decided(decision("AUTO", "DEVELOPING", { daysAgo: 45 })) }).inp);
    expect(condition(r, "l4_independent").met).toBe(false);
    expect(r).toMatchObject({ evidenceState: "DEVELOPING", propose: null, auto: null });
  });
});

describe("G4: the reviewer's 'new topic / source' mark counts as transfer_check", () => {
  /** Like level4 above, but the transfer episode carries no template facet - only the mark. */
  function marked(o: { mark?: boolean; delayedMark?: boolean } = {}) {
    const d = ep({ daysAgo: 3, contextId: "A-W3-EARTHQUAKES", facets: { delayedCheck: true, checkpoint: true }, transferMarked: o.delayedMark ?? false });
    const t = ep({ daysAgo: 2, contextId: "A-W5-NEWTOPIC", transferMarked: o.mark ?? true });
    const exposures = [exposure(17, "A-W3-EARTHQUAKES"), exposure(3, "A-W3-EARTHQUAKES", d.attemptId), exposure(2, "A-W5-NEWTOPIC", t.attemptId)];
    return { d, t, inp: input({ episodes: [d, t], decisions: confirmedIndependent(), exposures }) };
  }

  it("a mark + a delayed check reaches level 4 (PROPOSED); without the mark it does not", () => {
    const { d, t, inp } = marked();
    expect(run(inp)).toMatchObject({ evidenceState: "TRANSFERABLE", propose: "TRANSFERABLE" });
    expect(run(inp).evidence.propose).toEqual([d.episodeId, t.episodeId]);
    expect(run(marked({ mark: false }).inp)).toMatchObject({ evidenceState: "DEVELOPING", propose: null });
  });

  it("C7: an episode marked as a new topic is a transfer, not a delayed check - it cannot be both", () => {
    const r = run(marked({ delayedMark: true }).inp);
    expect(condition(r, "l4_delayed").met).toBe(false);
    expect(r.propose).toBeNull();
  });
});

describe("never downgrade by itself (§0 item 4)", () => {
  it("a confirmed 'Tự làm được' stays when later evidence only shows help", () => {
    const r = run(input({ episodes: [ep({ mode: "PRACTICE", score: 4 })], decisions: confirmedIndependent() }));
    expect(r).toMatchObject({ currentState: "INDEPENDENT", evidenceState: "SUPPORTED", proposedState: "INDEPENDENT", auto: null, propose: null, raiseFlag: false });
  });

  it("a level a person set by hand is not lowered or raised by AUTO below it", () => {
    const manual = decided(decision("MANUAL", "DEVELOPING", { daysAgo: 5, fromState: "INDEPENDENT" }));
    expect(run(input({ episodes: [ep({ assistance: [NOTES] })], decisions: manual }))).toMatchObject({ proposedState: "DEVELOPING", auto: null, propose: null });
  });
});

describe("⚑ conflict window (D12)", () => {
  const developingSince = (d: number) => decided(decision("AUTO", "DEVELOPING", { daysAgo: d }));

  it("an unaided first attempt below 3/4 after the level, within 21 days → ⚑, the level stays", () => {
    const low = ep({ daysAgo: 3, score: 2 });
    const r = run(input({ episodes: [low], decisions: developingSince(10) }));
    expect(r).toMatchObject({ proposedState: "DEVELOPING", raiseFlag: true, auto: null, propose: null });
    expect(r.flag).toMatchObject({ conflict: true, evidence: [low.episodeId] });
    expect(r.flag.key).toBe(evidenceKeyOf([low.decisionId]));
  });

  it("exactly 21 Vietnamese days counts, 22 does not", () => {
    expect(run(input({ episodes: [ep({ daysAgo: 21, score: 2 })], decisions: developingSince(30) })).raiseFlag).toBe(true);
    expect(run(input({ episodes: [ep({ daysAgo: 22, score: 2 })], decisions: developingSince(30) })).raiseFlag).toBe(false);
  });

  it.each([
    ["the low result is older than the level", () => input({ episodes: [ep({ daysAgo: 12, score: 2 })], decisions: developingSince(10) })],
    ["the low result had help", () => input({ episodes: [ep({ daysAgo: 3, score: 2, mode: "PRACTICE" })], decisions: developingSince(10) })],
    ["a baseline step", () => input({ episodes: [ep({ daysAgo: 3, score: 2, facets: { baseline: true } })], decisions: developingSince(10) })],
    ["the skill is only at level 1", () => input({ episodes: [ep({ daysAgo: 3, score: 2 })], decisions: decided(decision("AUTO", "SUPPORTED", { daysAgo: 10 })) })],
  ])("no ⚑ when %s", (_name, make) => {
    expect(run(make()).raiseFlag).toBe(false);
  });

  // Decisions are built oldest first: `seq` follows creation order, and the projection reads only `seq`.
  it("an open ⚑ blocks a second one", () => {
    const base = developingSince(10);
    const ds = decided(...base, decision("FLAG", "DEVELOPING", { daysAgo: 5, fromState: "DEVELOPING" }));
    const r = run(input({ episodes: [ep({ daysAgo: 3, score: 2 })], decisions: ds }));
    expect(r.flag.conflict).toBe(true);
    expect(r.raiseFlag).toBe(false);
  });

  it("after 'Giữ bậc' the old low result no longer counts; a NEW low result flags again", () => {
    const base = developingSince(10);
    const low1 = ep({ daysAgo: 3, score: 2 });
    const f = decision("FLAG", "DEVELOPING", { daysAgo: 3, fromState: "DEVELOPING", evidenceKey: evidenceKeyOf([low1.decisionId]) });
    const keep = decision("CONFIRMED", "DEVELOPING", { daysAgo: 2, fromState: "DEVELOPING", respondsTo: f.id });
    const ds = decided(...base, f, keep);
    expect(run(input({ episodes: [low1], decisions: ds })).flag.conflict).toBe(false);
    expect(run(input({ episodes: [low1, ep({ daysAgo: 1, score: 1 })], decisions: ds })).raiseFlag).toBe(true);
  });

  it("the same conflict is never flagged twice (key guard, also when the ⚑ was closed without restarting the level)", () => {
    const base = developingSince(10);
    const low1 = ep({ daysAgo: 3, score: 2 });
    const f = decision("FLAG", "DEVELOPING", { daysAgo: 3, fromState: "DEVELOPING", evidenceKey: evidenceKeyOf([low1.decisionId]) });
    const closed = decision("REJECTED", "DEVELOPING", { daysAgo: 2, fromState: "DEVELOPING", respondsTo: f.id, evidenceKey: null });
    const r = run(input({ episodes: [low1], decisions: decided(...base, f, closed) }));
    expect(r.flag.conflict).toBe(true);
    expect(r.raiseFlag).toBe(false);
  });

  it("route 2: a counted quiz below 75 % after 'Tự làm được' flags a reading skill", () => {
    const r = run(input({ targetKey: "A-T1-TEXT-R", domain: "reading", autoAttempts: [auto({ daysAgo: 2, correct: 1, wrong: 3 })], decisions: confirmedIndependent() }));
    expect(r).toMatchObject({ currentState: "INDEPENDENT", proposedState: "INDEPENDENT", raiseFlag: true });
  });
});

describe("one open proposal; 'Chưa' blocks the same evidence (D13)", () => {
  it("an open proposal blocks another one (AUTO still moves level 1–2)", () => {
    const r = run(input({ episodes: three(), decisions: decided(decision("PROPOSED", "INDEPENDENT", { daysAgo: 5 })) }));
    expect(r).toMatchObject({ auto: "DEVELOPING", propose: null });
  });

  it("after 'Chưa' the same evidence is never proposed again; one more piece of evidence is", () => {
    const eps = three();
    const a = decision("AUTO", "DEVELOPING", { daysAgo: 8 });
    const p = decision("PROPOSED", "INDEPENDENT", { daysAgo: 7, fromState: "DEVELOPING", evidenceKey: evidenceKeyOf(eps.map((e) => e.decisionId)) });
    const no = decision("REJECTED", "DEVELOPING", { daysAgo: 6, fromState: "DEVELOPING", respondsTo: p.id, evidenceKey: null });
    expect(run(input({ episodes: eps, decisions: decided(a, p, no) })).propose).toBeNull();
    expect(run(input({ episodes: [...eps, ep({ daysAgo: 1, contextId: "A-W3-EARTHQUAKES" })], decisions: decided(a, p, no) })).propose).toBe("INDEPENDENT");
  });

  it("after 'Xác nhận' nothing is left to propose", () => {
    expect(run(input({ episodes: three(), decisions: confirmedIndependent() }))).toMatchObject({ currentState: "INDEPENDENT", proposedState: "INDEPENDENT", propose: null, auto: null });
  });
});

describe("result contract", () => {
  it("carries the engine and policy versions; lists route-2 conditions only where they apply", () => {
    const r = run(input({ episodes: three() }));
    expect([r.engineVersion, r.policyVersion]).toEqual([ENGINE_VERSION, "AP-0.3"]);
    expect(conditionIds(r)).toEqual(["l1_evidence", "l2_unaided_first", "r1_first_attempts", "r1_contexts", "r1_span_days", "r1_direct_checkpoint", "l4_independent", "l4_delayed", "l4_transfer"]);
    expect(conditionIds(run(input({ domain: "reading" })))).toContain("r2_review");
  });

  it("is pure (same input, same output) and its evidence key ignores order but sees new evidence (UAT-16)", () => {
    const eps = three();
    const inp = input({ episodes: eps });
    expect(run(inp)).toEqual(run(inp));
    expect(run(input({ episodes: [...eps].reverse() })).evidenceKey).toBe(run(inp).evidenceKey);
    expect(run(input({ episodes: [...eps, ep()] })).evidenceKey).not.toBe(run(inp).evidenceKey);
  });
});
