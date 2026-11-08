/** Staff views of knowledge-point levels (W3; camelCase, parsed by shape.ts). Students never get any of these. */
import type { PointCondition, PointState } from "@/lib/engine/points/types";

/** Same limits as migration 0027. */
export const POINT_REASON_MIN = 3;
export const POINT_REASON_MAX = 300;

export type PointEvidenceRef = { ref: string; item: string; titleVi: string | null; at: string };
export type PointInboxItem = {
  id: string;
  kind: "PROPOSED" | "FLAG";
  learnerId: string;
  alias: string;
  isTest: boolean;
  tagKey: string;
  titleVi: string | null;
  fromState: PointState;
  toState: PointState;
  currentState: PointState;
  conditions: PointCondition[];
  evidence: PointEvidenceRef[];
  createdAt: string;
  canDecide: boolean;
};
export type PointInbox = { open: number; decidable: number; items: PointInboxItem[] };

export type PointAnswer = { ref: string; title: string | null; at: string; correct: boolean | null; support: boolean | null };
export type PointMapRow = {
  tagKey: string;
  titleVi: string | null;
  groupKey: string | null;
  groupVi: string | null;
  domainKey: string | null;
  domainVi: string | null;
  state: PointState;
  stateSince: string | null;
  /** The level came from the app (AUTO / nothing yet) or from a person (CONFIRMED / MANUAL). */
  stateKind: "AUTO" | "CONFIRMED" | "MANUAL" | null;
  flag: { id: string; at: string } | null;
  proposal: { id: string; toState: PointState; at: string } | null;
  conditions: PointCondition[];
  curricula: { id: string; title: string }[];
  answers: PointAnswer[];
};
export type PointMap = { learnerId: string; policyVersion: string | null; points: PointMapRow[] };
