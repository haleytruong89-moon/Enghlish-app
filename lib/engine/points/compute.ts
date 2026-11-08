/** Pure: no clock, no I/O. DOMAIN §5.2 with the thresholds of the policy (PP-0.1): the five worked examples are tests. */
import { evidenceKeyOf } from "../key";
import { projectPointDecisions, proposalKeyOf } from "./project";
import {
  POINT_ENGINE_VERSION,
  STATE_LEVEL,
  stateAt,
  type CountedQuestion,
  type PointCondition,
  type PointEngineInput,
  type PointEngineResult,
} from "./types";

const uniq = <T>(xs: readonly T[]): T[] => [...new Set(xs)];
/** "75 %" is exact integer arithmetic: correct * 100 >= pct * counted. */
const atLeastPct = (correct: number, total: number, pct: number) => total > 0 && correct * 100 >= pct * total;

export function computePointLevel(input: PointEngineInput): PointEngineResult {
  const p = input.policy.config;
  const proj = projectPointDecisions(input.decisions);
  const curLevel = STATE_LEVEL[proj.state];

  const counted = [...input.counted].sort((a, b) => a.day - b.day); // stable: same day keeps the order given
  const correctCounted = counted.filter((c) => c.correct);
  const days = uniq(counted.map((c) => c.day));
  const occByDay = new Map<number, CountedQuestion[]>();
  for (const c of counted) occByDay.set(c.day, [...(occByDay.get(c.day) ?? []), c]);

  // Level 1: the point was taught, or at least one question was done (right or wrong, with or without help).
  const level1 = input.taughtUnit || counted.length > 0 || input.supportedAttempted > 0 || input.supportedCorrect > 0;
  // Level 2: >= minCorrect counted correct answers, or >= minCorrect correct answers with help (help lifts to level 2 at most).
  const level2 = correctCounted.length >= p.developing.minCorrect || input.supportedCorrect >= p.developing.minCorrect;
  // Level 3: enough counted questions, enough of them right, on enough different days.
  const level3 =
    counted.length >= p.independent.minCounted &&
    atLeastPct(correctCounted.length, counted.length, p.independent.minAccuracyPct) &&
    days.length >= p.independent.minDistinctDays;
  // Level 4 (H2): at level 3, and on some day D at least `minDaysFromLastOccasion` after the latest earlier day: enough correct counted
  // questions, at least one from a source (template) that no earlier day used.
  const level4Occasion = (day: number, qs: CountedQuestion[]): boolean => {
    const earlier = days.filter((d) => d < day);
    if (earlier.length === 0) return false;
    const gap = day - Math.max(...earlier);
    const corr = qs.filter((x) => x.correct);
    const priorSources = new Set(counted.filter((c) => c.day < day).map((c) => c.sourceId));
    const differentSource = !p.transferable.requiresDifferentSource || corr.some((x) => !priorSources.has(x.sourceId));
    return gap >= p.transferable.minDaysFromLastOccasion && corr.length >= p.transferable.minCountedCorrect && differentSource;
  };
  const level4 = level3 && [...occByDay.entries()].some(([day, qs]) => level4Occasion(day, qs));

  let level = 0;
  if (level1) level = 1;
  if (level2) level = 2;
  if (level3) level = 3;
  if (level4) level = 4;
  // Never above the cap that help alone allows, and "Vận dụng được" is only ever proposed from "Tự làm được".
  const evidenceLevel = level;

  const refOf = (c: CountedQuestion) => c.ref;
  const proposeKey = level >= 3 ? evidenceKeyOf(counted.map(refOf)) : null;
  // The evidence only (never the book): a MANUAL row stores the key the tutor was looking at, so it must not change when that row is written (B2).
  const evidenceKey = evidenceKeyOf([...input.counted.map(refOf), `sc:${input.supportedCorrect}`, `sa:${input.supportedAttempted}`, `tu:${input.taughtUnit}`]);
  const held = proj.manualKey !== null && proj.manualKey === evidenceKey;

  const autoLevel = Math.min(evidenceLevel, 2);
  const auto = !held && autoLevel > curLevel ? stateAt(autoLevel) : null;
  const afterAuto = Math.max(curLevel, autoLevel);
  const proposeLevel = evidenceLevel >= 4 && curLevel < 3 ? 3 : evidenceLevel;
  const propose =
    !held &&
    proposeLevel >= 3 &&
    proposeLevel > afterAuto &&
    proj.openProposal === null &&
    proposeKey !== null &&
    !proj.proposalKeys.has(proposalKeyOf(stateAt(proposeLevel), proposeKey))
      ? stateAt(proposeLevel)
      : null;

  // ⚑: at level >= 3, `minWrong` or more wrong among the `window` most recent counted questions. The level is kept.
  const recent = counted.slice(-p.flag.window);
  const conflict = curLevel >= 3 && recent.filter((c) => !c.correct).length >= p.flag.minWrong;
  const flagKey = conflict ? evidenceKeyOf(recent.map(refOf)) : null;
  const raiseFlag = flagKey !== null && proj.openFlag === null && !proj.flagKeys.has(flagKey);

  const accuracy = counted.length ? Math.floor((correctCounted.length * 100) / counted.length) : 0;
  const conditions: PointCondition[] = [
    { id: "l2_correct", level: 2, have: correctCounted.length + input.supportedCorrect, need: p.developing.minCorrect, met: level2 },
    { id: "l3_counted", level: 3, have: counted.length, need: p.independent.minCounted, met: counted.length >= p.independent.minCounted },
    { id: "l3_accuracy", level: 3, have: accuracy, need: p.independent.minAccuracyPct, met: atLeastPct(correctCounted.length, counted.length, p.independent.minAccuracyPct) },
    { id: "l3_days", level: 3, have: days.length, need: p.independent.minDistinctDays, met: days.length >= p.independent.minDistinctDays },
    { id: "l4_gap_correct", level: 4, have: level4 ? p.transferable.minCountedCorrect : 0, need: p.transferable.minCountedCorrect, met: level4 },
  ];
  const autoEvidence = auto === null ? [] : correctCounted.length ? correctCounted.map(refOf) : counted.map(refOf);

  return {
    tagKey: input.tagKey,
    engineVersion: POINT_ENGINE_VERSION,
    policyVersion: input.policy.version,
    currentState: proj.state,
    evidenceState: stateAt(evidenceLevel),
    proposedState: stateAt(Math.max(evidenceLevel, curLevel)),
    conditions,
    auto,
    propose,
    raiseFlag,
    evidenceKey,
    proposeKey: propose === null ? null : proposeKey,
    flag: { conflict, key: flagKey, evidence: recent.map(refOf) },
    evidence: { auto: autoEvidence, propose: propose === null ? [] : counted.map(refOf), flag: conflict ? recent.map(refOf) : [] },
  };
}
