/** Builders for the pure engine tests (S7a). Every id is unique per call; `seq` follows the call order like english.mastery_decisions.seq. */
import { loadContentItems } from "@/lib/config/versions";
import type { AutoAttempt, DecisionKind, EngineInput, EnginePolicy, Exposure, Facets, MasteryDecision, ScoredEpisode, SkillState } from "@/lib/engine/types";

const items = loadContentItems();
export const AP03: EnginePolicy = { version: "AP-0.3", config: items.policies.find((p) => p.id === "AP-0.3")!.data };
export const AP02: EnginePolicy = { version: "AP-0.2-pilot", config: items.policies.find((p) => p.id === "AP-0.2-pilot")!.data };

/** 23/10/2026, 12:00 in Vietnam. */
export const NOW = new Date("2026-10-23T05:00:00Z");
/** Noon (Vietnam) `n` days before NOW. */
export const daysAgo = (n: number): string => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const NO_FACETS: Facets = { baseline: false, checkpoint: false, delayedCheck: false, transferCheck: false, revision: false };
let counter = 0;
const nextId = () => (counter += 1);

export type EpOpts = Partial<Omit<ScoredEpisode, "facets" | "at">> & { daysAgo?: number; facets?: Partial<Facets> };
/** One validated episode of the skill under test: by default an unaided first attempt (INDEPENDENT_CHECK), 3/4, 1 day ago, A-W1. */
export function ep(o: EpOpts = {}): ScoredEpisode {
  const i = nextId();
  const { daysAgo: d = 1, facets, ...rest } = o;
  return {
    episodeId: `ep-${i}`, attemptId: `at-${i}`, activityId: `act-${i}`, at: daysAgo(d), contextId: "A-W1-VOLCANOES",
    isFirstAttempt: true, mode: "INDEPENDENT_CHECK", observedDirectly: false, transferMarked: false, assistance: [], declaredUnknown: false,
    decisionId: `vd-${i}`, score: 3, ...rest, facets: { ...NO_FACETS, ...facets },
  };
}

export type AutoOpts = Partial<Omit<AutoAttempt, "facets" | "items" | "at">> & {
  daysAgo?: number; facets?: Partial<Facets>; correct?: number; wrong?: number; blank?: number;
};
/** One auto-checked attempt with `correct` / `wrong` / `blank` closed items for the skill under test. */
export function auto(o: AutoOpts = {}): AutoAttempt {
  const i = nextId();
  const { daysAgo: d = 1, facets, correct = 0, wrong = 0, blank = 0, ...rest } = o;
  const mk = (n: number, result: "correct" | "incorrect" | "blank") => Array.from({ length: n }, (_, k) => ({ itemId: `q${i}-${result}-${k}`, result }));
  return {
    attemptId: `aa-${i}`, episodeId: `ae-${i}`, activityId: `act-${i}`, at: daysAgo(d), isFirstAttempt: true, mode: "INDEPENDENT_CHECK",
    assistance: [], declaredUnknown: false, ...rest, facets: { ...NO_FACETS, ...facets },
    items: [...mk(correct, "correct"), ...mk(wrong, "incorrect"), ...mk(blank, "blank")],
  };
}

/** One practice of the skill `d` days ago on `contextId` (null = a lesson, no topic), from attempt `attemptId` (null = no attempt). */
export const exposure = (d: number, contextId: string | null = "A-W1-VOLCANOES", attemptId: string | null = null): Exposure => ({
  at: daysAgo(d), contextId, attemptId,
});

export type DecisionOpts = Partial<Omit<MasteryDecision, "createdAt">> & { daysAgo?: number };
export function decision(kind: DecisionKind, toState: SkillState, o: DecisionOpts = {}): MasteryDecision {
  const i = nextId();
  const { daysAgo: d = 30, ...rest } = o;
  return {
    id: `md-${i}`, seq: i, kind, fromState: "NOT_OBSERVED", toState,
    evidenceKey: kind === "PROPOSED" || kind === "FLAG" ? `${i}-${"0".repeat(16)}` : null, respondsTo: null, createdAt: daysAgo(d), ...rest,
  };
}

/** Engine input for a writing skill under AP-0.3 at NOW; override any part. */
export const input = (o: Partial<EngineInput> = {}): EngineInput => ({
  targetKey: "A-L3-CAUSE-W", domain: "writing", episodes: [], autoAttempts: [], exposures: [], decisions: [], policy: AP03, now: NOW, ...o,
});
