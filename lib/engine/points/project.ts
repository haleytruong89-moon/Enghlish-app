import type { PointDecision, PointState } from "./types";

export type PointProjection = {
  state: PointState;
  stateSince: string | null;
  stateDecisionId: string | null;
  openProposal: PointDecision | null;
  openFlag: PointDecision | null;
  /** `proposalKeyOf(toState, evidenceKey)` of every PROPOSED ever written for this point (the same evidence is never proposed twice for the same level). */
  proposalKeys: ReadonlySet<string>;
  /** Evidence keys of every FLAG ever written. */
  flagKeys: ReadonlySet<string>;
  /** When the latest AUTO / CONFIRMED / MANUAL is a MANUAL, the evidence key stored on it; else null. */
  manualKey: string | null;
};

export const proposalKeyOf = (toState: string, evidenceKey: string): string => `${toState}:${evidenceKey}`;

/**
 * point_state from the book - the same rule as english.eng_project_point_state: the state is the latest AUTO / CONFIRMED / MANUAL by seq;
 * a PROPOSED / FLAG is open while no row responds to it.
 */
export function projectPointDecisions(decisions: readonly PointDecision[]): PointProjection {
  const ds = [...decisions].sort((a, b) => a.seq - b.seq);
  const answered = new Set(ds.flatMap((d) => (d.respondsTo ? [d.respondsTo] : [])));
  let state: PointState = "NOT_OBSERVED";
  let stateSince: string | null = null;
  let stateDecisionId: string | null = null;
  let manualKey: string | null = null;
  let openProposal: PointDecision | null = null;
  let openFlag: PointDecision | null = null;
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
