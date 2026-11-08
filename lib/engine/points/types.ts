/**
 * W3 knowledge-point level engine (DOMAIN §5.2, policy PP-x). Parallel to the S7a skill engine but separate: points are keyed by
 * `error_tags.key`, the evidence is a CLOSED QUESTION (not an episode), and the thresholds come from `point_policies`.
 * Relative imports only and no server-only: Node scripts and DB tests import this folder.
 */
import type { PointPolicy } from "../../config/pointPolicySchema";
import { SKILL_STATES, STATE_LEVEL, stateAt, type SkillState } from "../types";

export { SKILL_STATES as POINT_STATES, STATE_LEVEL, stateAt };
export type { PointPolicy, SkillState as PointState };

/** Written on every point decision (point_decisions.engine_version). Bump it whenever a rule in computePointLevel changes. */
export const POINT_ENGINE_VERSION = "PP-eng-1";

/** One counted question: closed, graded, the child's first try, no help. `day` = Vietnamese calendar day number of the day it was done. */
export type CountedQuestion = { ref: string; day: number; correct: boolean; sourceId: string; first: boolean };

export type PointDecisionKind = "AUTO" | "PROPOSED" | "CONFIRMED" | "REJECTED" | "MANUAL" | "FLAG";
export type PointDecision = {
  id: string;
  /** point_decisions.seq: insert order, the only order used for "latest". */
  seq: number;
  kind: PointDecisionKind;
  fromState: SkillState;
  toState: SkillState;
  evidenceKey: string | null;
  respondsTo: string | null;
  createdAt: string;
};

export type PointEngineInput = {
  tagKey: string;
  /** The point is in a Unit that was taught (in progress / done / in a lesson note). */
  taughtUnit: boolean;
  counted: CountedQuestion[];
  /** Correct answers WITH help (a tutor session, "làm cùng thầy/cô"): lift to level 2 at most. */
  supportedCorrect: number;
  /** Graded answers WITH help, right or wrong: they make the point "seen" (level 1). */
  supportedAttempted: number;
  decisions: PointDecision[];
  policy: { version: string; config: PointPolicy };
  now: Date;
};

export const POINT_CONDITION_IDS = ["l2_correct", "l3_counted", "l3_accuracy", "l3_days", "l4_gap_correct"] as const;
export type PointConditionId = (typeof POINT_CONDITION_IDS)[number];
export type PointCondition = { id: PointConditionId; level: 2 | 3 | 4; have: number; need: number; met: boolean };

export type PointEngineResult = {
  tagKey: string;
  engineVersion: string;
  policyVersion: string;
  currentState: SkillState;
  /** The highest level the evidence alone supports. */
  evidenceState: SkillState;
  /** What the point would show if every proposal were confirmed: never below currentState (never downgrade). */
  proposedState: SkillState;
  conditions: PointCondition[];
  /** AUTO to write (levels 1–2, only upward). */
  auto: SkillState | null;
  /** PROPOSED to write (levels 3–4). */
  propose: SkillState | null;
  raiseFlag: boolean;
  evidenceKey: string;
  proposeKey: string | null;
  flag: { conflict: boolean; key: string | null; evidence: string[] };
  evidence: { auto: string[]; propose: string[]; flag: string[] };
};
