/** S7a staff views of skill states (camelCase, parsed by shape.ts). Students never get any of these. */
import type { Condition, Route, SkillState } from "@/lib/engine/types";
import type { DomainKey } from "@/lib/skillmap/types";

/** Same limits as migration 0023. */
export const REASON_MIN = 3;
export const REASON_MAX = 300;
export const CONFIRM_ALL_MAX = 50;
/** A person sets a level by hand only to 1 or 2 (spec §3 step 5); 3–4 only through a confirmed proposal. */
export const MANUAL_STATES = ["SUPPORTED", "DEVELOPING"] as const;

export type SkillStateRow = {
  targetKey: string;
  titleVi: string | null;
  domainKey: DomainKey | null;
  state: SkillState;
  /** The level came from the app (AUTO): "App tự cập nhật". */
  auto: boolean;
  stateSince: string | null;
  flag: { id: string; at: string } | null;
  proposal: { id: string; toState: SkillState; route: Route | null; at: string } | null;
  conditions: Condition[];
  route: Route | null;
  evaluatedAt: string | null;
};
export type SkillStates = { policyVersion: string | null; setId: string | null; rows: SkillStateRow[] };

export type SkillEvidence = { episodeId: string; titleVi: string | null; stepNo: number; at: string };
export type SkillInboxItem = {
  id: string;
  kind: "PROPOSED" | "FLAG";
  learnerId: string;
  alias: string;
  isTest: boolean;
  targetKey: string;
  titleVi: string | null;
  fromState: SkillState;
  toState: SkillState;
  currentState: SkillState;
  route: Route | null;
  conditions: Condition[];
  evidence: SkillEvidence[];
  createdAt: string;
  canDecide: boolean;
};
export type SkillInbox = { open: number; decidable: number; items: SkillInboxItem[] };
