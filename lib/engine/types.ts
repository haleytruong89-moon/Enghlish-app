/**
 * S7a skill-state engine: shared types (spec docs/superpowers/specs/2026-10-23-s7a-skill-states-design.md §2; DESIGN §8).
 * Relative imports only and no server-only: Node scripts and DB tests import this folder (scripts/lib/enginePg.ts).
 */
import type { AssessmentPolicy } from "../config/schemas";
import type { DomainKey } from "../skillmap/types";

/** Written on every engine decision (mastery_decisions.engine_version). Bump it whenever a rule in computeTargetState changes. */
export const ENGINE_VERSION = "S7a-1";

/** UX_COPY_GUIDE §3.2. ⚑ "Cần thầy/cô xem lại" is a flag on top of a state, never a state (D12). */
export const SKILL_STATES = ["NOT_OBSERVED", "SUPPORTED", "DEVELOPING", "INDEPENDENT", "TRANSFERABLE"] as const;
export type SkillState = (typeof SKILL_STATES)[number];
export type Level = 0 | 1 | 2 | 3 | 4;
export const STATE_LEVEL: Record<SkillState, Level> = { NOT_OBSERVED: 0, SUPPORTED: 1, DEVELOPING: 2, INDEPENDENT: 3, TRANSFERABLE: 4 };
export const stateAt = (level: number): SkillState => SKILL_STATES[Math.max(0, Math.min(4, Math.trunc(level)))] as SkillState;

export const DECISION_KINDS = ["AUTO", "PROPOSED", "CONFIRMED", "REJECTED", "MANUAL", "FLAG"] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

export type Mode = "PRACTICE" | "INDEPENDENT_CHECK" | "REVISION";
/** 1 = scored by a person (D22); 2 = auto-checked closed items in the app (P3-b). */
export type Route = 1 | 2;
export type Facets = { baseline: boolean; checkpoint: boolean; delayedCheck: boolean; transferCheck: boolean; revision: boolean };
/** One assistance_events row that lists this skill. */
export type AssistanceMark = { kind: string; verification: "observed" | "declared" | "unknown" };

/** One validated episode, as seen for ONE skill: its current AGREE / MODIFY decision for that skill. */
export type ScoredEpisode = {
  episodeId: string;
  attemptId: string;
  activityId: string;
  /** attempts.submitted_at (ISO). */
  at: string;
  /** episodes.context_id = template id (topic / source family). */
  contextId: string;
  isFirstAttempt: boolean;
  mode: Mode;
  observedDirectly: boolean;
  facets: Facets;
  /** G4: the reviewer marked this episode "Bài này ở chủ đề / nguồn mới (vận dụng)" (episode_marks, append-only). Counts as transfer_check like the template facet. */
  transferMarked: boolean;
  assistance: AssistanceMark[];
  /** attempts.declared_assistance contains 'unknown' (work recorded outside the app; UAT-06). */
  declaredUnknown: boolean;
  /** validation_decisions.id of the current decision for this skill. */
  decisionId: string;
  /** final_score 0..4, or null = "không có cơ hội thể hiện" (never 0). */
  score: 0 | 1 | 2 | 3 | 4 | null;
};

export type AutoItemResult = "correct" | "incorrect" | "blank";
/** One attempt with auto-checked closed items of this skill (attempt_auto_checks joined to the snapshot's items). */
export type AutoAttempt = {
  attemptId: string;
  episodeId: string;
  activityId: string;
  at: string;
  isFirstAttempt: boolean;
  mode: Mode;
  facets: Facets;
  assistance: AssistanceMark[];
  declaredUnknown: boolean;
  items: { itemId: string; result: AutoItemResult }[];
};

/** exposure_log row of this skill; contextId null = a lesson (or no attempt). */
export type Exposure = { at: string; contextId: string | null; attemptId: string | null };

export type MasteryDecision = {
  id: string;
  /** mastery_decisions.seq: insert order, the only order used for "latest". */
  seq: number;
  kind: DecisionKind;
  fromState: SkillState;
  toState: SkillState;
  evidenceKey: string | null;
  respondsTo: string | null;
  createdAt: string;
};

export type EnginePolicy = { version: string; config: AssessmentPolicy };

export type EngineInput = {
  targetKey: string;
  /** Skill-map domain of the skill (route 2 needs it); null = not in the map. */
  domain: DomainKey | null;
  episodes: ScoredEpisode[];
  autoAttempts: AutoAttempt[];
  exposures: Exposure[];
  decisions: MasteryDecision[];
  policy: EnginePolicy;
  now: Date;
};

export const CONDITION_IDS = [
  "l1_evidence",
  "l2_unaided_first",
  "l2_auto_items",
  "l2_auto_accuracy",
  "r1_first_attempts",
  "r1_contexts",
  "r1_span_days",
  "r1_direct_checkpoint",
  "r2_items",
  "r2_activities",
  "r2_accuracy",
  "r2_review",
  "l4_independent",
  "l4_delayed",
  "l4_transfer",
] as const;
export type ConditionId = (typeof CONDITION_IDS)[number];

/** One condition of one level ("điều kiện đạt/chưa"): stored as is in mastery_decisions.conditions and competency_state.conditions. */
export type Condition = {
  id: ConditionId;
  level: 1 | 2 | 3 | 4;
  route: Route;
  have: number;
  need: number;
  met: boolean;
  /** Episode ids that support it (links in the inbox). */
  evidence: string[];
};

export type EngineResult = {
  targetKey: string;
  engineVersion: string;
  policyVersion: string;
  /** From the decisions (projection). */
  currentState: SkillState;
  /** The highest level the evidence alone supports (level 4 also needs currentState ≥ Tự làm được). */
  evidenceState: SkillState;
  /** What the skill would show if every proposal were confirmed: never below currentState (never downgrade). */
  proposedState: SkillState;
  /** Route that reached evidenceState (1 below level 3 and at level 4); null = nothing yet. */
  route: Route | null;
  conditions: Condition[];
  flag: { conflict: boolean; key: string | null; evidence: string[] };
  /** AUTO to write (levels 1–2, only upward). */
  auto: SkillState | null;
  /** PROPOSED to write (levels 3–4). */
  propose: SkillState | null;
  /** FLAG to write (⚑, level kept). */
  raiseFlag: boolean;
  /** Key of every validated decision + auto-checked attempt read for this skill (D13). */
  evidenceKey: string;
  evidence: { auto: string[]; propose: string[]; flag: string[] };
};
