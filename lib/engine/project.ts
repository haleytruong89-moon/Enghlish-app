import type { MasteryDecision, SkillState } from "./types";

export type DecisionProjection = {
  state: SkillState;
  stateSince: string | null;
  stateDecisionId: string | null;
  openProposal: MasteryDecision | null;
  openFlag: MasteryDecision | null;
  /** Evidence keys of every PROPOSED / FLAG ever written for this skill (D12, D13: the same evidence is never proposed / flagged twice). */
  proposalKeys: ReadonlySet<string>;
  flagKeys: ReadonlySet<string>;
};

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
  let openProposal: MasteryDecision | null = null;
  let openFlag: MasteryDecision | null = null;
  const proposalKeys = new Set<string>();
  const flagKeys = new Set<string>();
  for (const d of ds) {
    if (d.kind === "AUTO" || d.kind === "CONFIRMED" || d.kind === "MANUAL") {
      state = d.toState;
      stateSince = d.createdAt;
      stateDecisionId = d.id;
    } else if (d.kind === "PROPOSED") {
      if (d.evidenceKey) proposalKeys.add(d.evidenceKey);
      if (!answered.has(d.id)) openProposal = d;
    } else if (d.kind === "FLAG") {
      if (d.evidenceKey) flagKeys.add(d.evidenceKey);
      if (!answered.has(d.id)) openFlag = d;
    }
  }
  return { state, stateSince, stateDecisionId, openProposal, openFlag, proposalKeys, flagKeys };
}
