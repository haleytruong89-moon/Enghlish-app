/**
 * S7a engine (spec §2, DESIGN §8): the level of ONE skill of ONE child from its evidence. Pure: no I/O, no clock (input.now).
 * The SQL (english.eng_apply_engine_results) repeats every guard before it writes, so a wrong caller can never downgrade a level,
 * write a second open proposal or propose the same evidence twice.
 */
import { daysSinceLastPractice, vnDay } from "./days";
import { evidenceKeyOf } from "./key";
import { projectDecisions, proposalKeyOf } from "./project";
import {
  ENGINE_VERSION,
  STATE_LEVEL,
  stateAt,
  type AssistanceMark,
  type AutoAttempt,
  type Condition,
  type ConditionId,
  type EngineInput,
  type EngineResult,
  type Facets,
  type Mode,
  type Route,
  type ScoredEpisode,
} from "./types";

type Helpable = { mode: Mode; facets: Facets; assistance: readonly AssistanceMark[]; declaredUnknown: boolean };
type Scored = ScoredEpisode & { score: 0 | 1 | 2 | 3 | 4 };

/** D4: help that touches the skill - a help row, an "unknown" declaration (UAT-06), a revision (FR-14a), or a mode outside `allowedModes`. */
export function hadHelp(e: Helpable, allowedModes: readonly Mode[], maxAssistance: number, revisionNeverFirst: boolean): boolean {
  if (revisionNeverFirst && (e.mode === "REVISION" || e.facets.revision)) return true;
  if (e.declaredUnknown) return true;
  if (e.assistance.length > maxAssistance) return true;
  return !allowedModes.includes(e.mode);
}

const byTime = <T extends { at: string }>(xs: readonly T[]): T[] => [...xs].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
const uniq = <T>(xs: readonly T[]): T[] => [...new Set(xs)];
const episodeIds = (xs: readonly { episodeId: string }[]): string[] => uniq(xs.map((x) => x.episodeId));
const correctOf = (a: AutoAttempt): number => a.items.filter((i) => i.result === "correct").length;
/** Integer-safe "accuracy ≥ pct %": correct × 100 ≥ pct × total (and at least one item). */
const atLeastPct = (correct: number, total: number, pct: number): boolean => total > 0 && correct * 100 >= pct * total;

function cond(id: ConditionId, level: Condition["level"], route: Route, have: number, need: number, evidence: string[] = []): Condition {
  return { id, level, route, have, need, met: have >= need, evidence };
}

export function computeTargetState(input: EngineInput): EngineResult {
  const p = input.policy.config;
  const proj = projectDecisions(input.decisions);
  const curLevel = STATE_LEVEL[proj.state];
  const helped = (e: Helpable) => hadHelp(e, p.independent.allowedModes, p.independent.maxAssistanceAffectingTarget, p.revisionNeverFirstAttempt);

  const scored = byTime(input.episodes).filter((e): e is Scored => e.score !== null);
  const unaided = scored.filter((e) => e.isFirstAttempt && !helped(e));

  // Levels 1–2 (D5)
  const l1 = scored.filter((e) => e.score >= p.supported.minScore);
  const l2 = unaided.filter((e) => e.score >= p.developing.minScore);

  // Level 3 · route 1 (D22): unaided first attempts, never baseline, each ≥ minScoreEach
  const pool = unaided.filter((e) => !e.facets.baseline && e.score >= p.independent.minScoreEach);
  const poolIds = episodeIds(pool);
  const days = uniq(pool.map((e) => vnDay(e.at)));
  const span = days.length > 0 ? Math.max(...days) - Math.min(...days) : 0;
  const direct = pool.filter((e) => e.facets.checkpoint || e.observedDirectly);
  const conditions: Condition[] = [
    cond("l1_evidence", 1, 1, l1.length, 1, episodeIds(l1)),
    cond("l2_unaided_first", 2, 1, l2.length, 1, episodeIds(l2)),
    cond("r1_first_attempts", 3, 1, p.independent.distinctDays ? days.length : pool.length, p.independent.minFirstAttemptEpisodes, poolIds),
    cond("r1_contexts", 3, 1, uniq(pool.map((e) => e.contextId)).length, p.independent.minContexts, poolIds),
    cond("r1_span_days", 3, 1, span, p.independent.minSpanDays, poolIds),
    cond("r1_direct_checkpoint", 3, 1, direct.length, p.independent.minDirectCheckpoint, episodeIds(direct)),
  ];
  const route1 = conditions.filter((c) => c.level === 3).every((c) => c.met);

  // Level 3 · route 2 (P3-b, D9): only skills of the listed domains, only when the policy has receptiveAuto
  const ra = p.receptiveAuto;
  let counted: AutoAttempt[] = [];
  let route2 = false;
  let l1Auto = false;
  let l2Auto = false;
  if (ra && input.domain !== null && ra.domains.includes(input.domain)) {
    counted = byTime(input.autoAttempts).filter(
      (a) => a.items.length > 0 && (!ra.firstAttemptOnly || a.isFirstAttempt) && !hadHelp(a, ra.allowedModes, ra.maxAssistanceAffectingTarget, p.revisionNeverFirstAttempt),
    );
    const total = counted.reduce((s, a) => s + a.items.length, 0);
    const correct = counted.reduce((s, a) => s + correctOf(a), 0);
    const ids = episodeIds(counted);
    // S5 (P3-b "bài ôn sau ≥ 14 ngày"): the review must come >= reviewMinDays after the latest exposure of the skill. A step marked
    // delayed_check gets no shortcut: two quizzes on one day are not a review, whatever the step is called.
    const reviews = counted.filter((a) => {
      if (!atLeastPct(correctOf(a), a.items.length, ra.reviewMinAccuracyPct)) return false;
      const gap = daysSinceLastPractice(input.exposures, a.at, a.attemptId, null);
      return gap !== null && gap >= ra.reviewMinDays;
    });
    const accuracy = cond("r2_accuracy", 3, 2, total > 0 ? Math.floor((correct * 100) / total) : 0, ra.minAccuracyPct, ids);
    accuracy.met = atLeastPct(correct, total, ra.minAccuracyPct);
    // G2: the same counted items lift a skill to level 1 (≥ 1 right) and level 2 (≥ developingMinItems at ≥ developingMinAccuracyPct) before route 2 is complete.
    const devAccuracy = cond("l2_auto_accuracy", 2, 2, total > 0 ? Math.floor((correct * 100) / total) : 0, ra.developingMinAccuracyPct, ids);
    devAccuracy.met = atLeastPct(correct, total, ra.developingMinAccuracyPct);
    const dev = [cond("l2_auto_items", 2, 2, total, ra.developingMinItems, ids), devAccuracy];
    l1Auto = correct > 0;
    l2Auto = dev.every((c) => c.met);
    conditions.push(...dev);
    const r2 = [
      cond("r2_items", 3, 2, total, ra.minItems, ids),
      cond("r2_activities", 3, 2, uniq(counted.map((a) => a.activityId)).length, ra.minActivities, ids),
      accuracy,
      cond("r2_review", 3, 2, reviews.length > 0 ? 1 : 0, 1, episodeIds(reviews)),
    ];
    conditions.push(...r2);
    route2 = r2.every((c) => c.met);
  }

  // Level 4 (§1 item 4, D8, D10): current ≥ Tự làm được + a delayed check + a transfer check, two different episodes
  const t = p.transferable;
  const passing = unaided.filter((e) => e.score >= p.independent.minScoreEach);
  const delayed = passing.filter((e) => {
    // C7 / G4: work the reviewer marked as "new topic / source" is a transfer, never a delayed check.
    if (!e.facets.delayedCheck || e.transferMarked) return false;
    const gap = daysSinceLastPractice(input.exposures, e.at, e.attemptId, e.contextId);
    return gap !== null && gap >= t.delayedMinDaysFromLastExposure;
  });
  // transferNeedsTutorDescribedDifference: the template's transfer_check mark is that description (§1 item 4).
  // G4: the same description can come from the reviewer's append-only mark (episode_marks), not only from the template.
  const transfers = passing.filter((e) => e.facets.transferCheck || e.transferMarked);
  const usable = transfers.filter((x) => t.minDistinctEpisodes < 2 || delayed.length === 0 || delayed.some((d) => d.episodeId !== x.episodeId));
  const l4 = [
    cond("l4_independent", 4, 1, curLevel >= 3 ? 1 : 0, 1),
    cond("l4_delayed", 4, 1, delayed.length, t.needs.includes("delayed_check") ? 1 : 0, episodeIds(delayed)),
    cond("l4_transfer", 4, 1, usable.length, t.needs.includes("transfer_check") ? 1 : 0, episodeIds(usable)),
  ];
  conditions.push(...l4);

  // What the evidence supports
  const met = (id: ConditionId) => conditions.find((c) => c.id === id)?.met ?? false;
  let level = 0;
  if (met("l1_evidence") || l1Auto) level = 1;
  if (met("l2_unaided_first") || l2Auto) level = 2;
  if (route1 || route2) level = 3;
  if (l4.every((c) => c.met)) level = 4;
  const route: Route | null = level === 0 ? null : level === 3 ? (route1 ? 1 : 2) : 1;
  const level3Ids = route1 ? poolIds : episodeIds(counted);
  // What each level's conditions actually used (S3, B1). Level 3: route 1 = the pool of decisions, route 2 = the counted attempts.
  // Level 4: the delayed and transfer episodes' decisions + the marks that made them transfers.
  const level3Key = evidenceKeyOf(route1 ? pool.map((e) => e.decisionId) : counted.map((a) => a.attemptId));
  const level4Key = evidenceKeyOf([
    ...delayed.map((e) => e.decisionId),
    ...usable.map((e) => e.decisionId),
    ...usable.flatMap((e) => (e.transferMarkId ? [e.transferMarkId] : [])),
  ]);
  const proposeKey = level === 4 ? level4Key : level === 3 ? level3Key : null;

  // What to write (D13, D14): AUTO only upward and only to 1–2; PROPOSED for 3–4 when none is open and this level's evidence was never proposed
  const evidenceKey = evidenceKeyOf([
    ...input.episodes.map((e) => e.decisionId),
    ...input.autoAttempts.map((a) => a.attemptId),
    ...input.episodes.flatMap((e) => (e.transferMarkId ? [e.transferMarkId] : [])),
  ]);
  // B2: a level a tutor set by hand stands until there is NEW evidence (the key differs from the one stored on that MANUAL row).
  const held = proj.manualKey !== null && proj.manualKey === evidenceKey;
  const autoLevel = Math.min(level, 2);
  const auto = !held && autoLevel > curLevel ? stateAt(autoLevel) : null;
  const afterAuto = Math.max(curLevel, autoLevel);
  const propose =
    !held && level >= 3 && level > afterAuto && proj.openProposal === null && proposeKey !== null && !proj.proposalKeys.has(proposalKeyOf(stateAt(level), proposeKey))
      ? stateAt(level)
      : null;

  // ⚑ (D12): level ≥ 2, low unaided evidence after the decision that set it, within conflictWindowDays
  const today = vnDay(input.now);
  const since = proj.stateSince === null ? null : Date.parse(proj.stateSince);
  // S2: "after the decision" counts from the later of when the work was handed in and when it was validated (a low result validated late still counts);
  // the window itself counts from the hand-in day.
  const recent = (at: string, validatedAt: string = at) =>
    since !== null && Math.max(Date.parse(at), Date.parse(validatedAt)) > since && today - vnDay(at) <= p.conflictWindowDays;
  const lowEpisodes = curLevel >= 2 ? unaided.filter((e) => !e.facets.baseline && e.score < p.independent.minScoreEach && recent(e.at, e.validatedAt)) : [];
  // N1: a quiz of fewer than flagMinItems items is too small to doubt a level a tutor confirmed (2/3 is one slip; 2/4 is a pattern).
  const lowAuto =
    curLevel >= 2 && ra
      ? counted.filter((a) => recent(a.at) && a.items.length >= ra.flagMinItems && !atLeastPct(correctOf(a), a.items.length, ra.minAccuracyPct))
      : [];
  const conflict = lowEpisodes.length + lowAuto.length > 0;
  const flagKey = conflict ? evidenceKeyOf([...lowEpisodes.map((e) => e.decisionId), ...lowAuto.map((a) => a.attemptId)]) : null;
  const raiseFlag = flagKey !== null && proj.openFlag === null && !proj.flagKeys.has(flagKey);
  const flagIds = uniq([...episodeIds(lowEpisodes), ...episodeIds(lowAuto)]);

  const autoEvidence =
    auto === null
      ? []
      : auto === "SUPPORTED"
        ? l1.length > 0 ? episodeIds(l1) : episodeIds(counted.filter((a) => correctOf(a) > 0))
        : l2.length > 0 ? episodeIds(l2) : l2Auto ? episodeIds(counted) : level3Ids;
  const autoRoute: Route | null =
    auto === null ? null : auto === "SUPPORTED" ? (l1.length > 0 ? 1 : 2) : l2.length > 0 ? 1 : l2Auto ? 2 : route1 ? 1 : 2;
  const proposeEvidence = propose === null ? [] : propose === "TRANSFERABLE" ? uniq([...episodeIds(delayed), ...episodeIds(usable)]) : level3Ids;

  return {
    targetKey: input.targetKey,
    engineVersion: ENGINE_VERSION,
    policyVersion: input.policy.version,
    currentState: proj.state,
    evidenceState: stateAt(level),
    proposedState: held ? proj.state : stateAt(Math.max(level, curLevel)),
    route,
    autoRoute,
    conditions,
    flag: { conflict, key: flagKey, evidence: flagIds },
    auto,
    propose,
    raiseFlag,
    evidenceKey,
    proposeKey: propose === null ? null : proposeKey,
    evidence: { auto: autoEvidence, propose: proposeEvidence, flag: flagIds },
  };
}
