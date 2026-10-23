import type { MasteryDecision, SkillState } from "./types";

export type DecisionProjection = {
  state: SkillState;
  stateSince: string | null;
  stateDecisionId: string | null;
  openProposal: MasteryDecision | null;
  openFlag: MasteryDecision | null;
  /** `proposalKeyOf(toState, evidenceKey)` of every PROPOSED ever written for this skill (D13, B1: the same evidence is never proposed twice FOR THE SAME LEVEL). */
  proposalKeys: ReadonlySet<string>;
  /** Evidence keys of every FLAG ever written (D12). */
  flagKeys: ReadonlySet<string>;
  /** B2: when the latest AUTO / CONFIRMED / MANUAL is a MANUAL, the evidence key stored on it (what the tutor saw); else null. */
  manualKey: string | null;
};

/** "already proposed" is scoped to the level proposed: level 3 and level 4 look at different evidence (B1). */
export const proposalKeyOf = (toState: string, evidenceKey: string): string => `${toState}:${evidenceKey}`;

/**
 * competency_state from the book (D15) - the same rule as english.eng_project_skill_state: the state is the latest AUTO / CONFIRMED / MANUAL
 * by seq; a PROPOSED / FLAG is open while no row responds to it.
 */
export function projectDecisions(decisions: readonly MasteryDecision[]): DecisionProjection {
  const ds = [...decisions].sort((a, b) => a.seq - b.seq);
  const answered = new Set(ds.flatMap((d) => (d.respondsTo ? [d.respondsTo] : [])));
  let state: SkillState = "NOT_OBSERVED";
  let stateSince: string | null = null;
  let stateDecisionId: string | null = null;
  let manualKey: string | null = null;
  let openProposal: MasteryDecision | null = null;
  let openFlag: MasteryDecision | null = null;
  const proposalKeys = new Set<string>();
  const flagKeys = new Set<string>();
  for (const d of ds) {
    if (d.kind === "AUTO" || d.kind === "CONFIRMED" || d.kind === "MANUAL") {
      state = d.toState;
      stateSince = d.createdAt;
      stateDecisionId = d.id;
      manualKey = d.kind === "MANUAL" ? d.evidenceKey : null;
    } else if (d.kind === "PROPOSED") {
      if (d.evidenceKey) proposalKeys.add(proposalKeyOf(d.toState, d.evidenceKey));
      if (!answered.has(d.id)) openProposal = d;
    } else if (d.kind === "FLAG") {
      if (d.evidenceKey) flagKeys.add(d.evidenceKey);
      if (!answered.has(d.id)) openFlag = d;
    }
  }
  return { state, stateSince, stateDecisionId, openProposal, openFlag, proposalKeys, flagKeys, manualKey };
}
