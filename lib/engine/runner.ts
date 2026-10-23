/** The server side of the S7a engine (spec §3): load → compute every skill → apply. Pure of any framework; the stores do the I/O. */
import { computeTargetState } from "./computeTargetState";
import { parseApplied, parseEngineInputs, sliceTarget, toApplyRow, type Applied, type ApplyRow } from "./shape";
import { ENGINE_VERSION, type EngineResult } from "./types";

/** The engine functions of migration 0023 (service role; always after requireAccess or after a write that passed it). */
export interface EngineStore {
  loadInputs(learnerId: string, targets: string[] | null): Promise<unknown>;
  applyResults(learnerId: string, rows: ApplyRow[], engineVersion: string): Promise<unknown>;
  resetStates(learnerId: string, byMemberId: string): Promise<unknown>;
}

export type RecomputeSummary = { learnerId: string; results: EngineResult[]; applied: Applied };
const NOTHING: Applied = { auto: 0, proposed: 0, flagged: 0, policyVersion: null };

/** Recompute the skills of one child (null = every skill of the current set; keys outside the set are ignored, D11) and write the outcome. */
export async function recomputeLearner(store: EngineStore, learnerId: string, targets: string[] | null = null): Promise<RecomputeSummary> {
  const inputs = parseEngineInputs(await store.loadInputs(learnerId, targets));
  if (inputs.policy === null || inputs.targets.length === 0) return { learnerId, results: [], applied: NOTHING };
  const results = inputs.targets.map((t) => computeTargetState(sliceTarget(inputs, t.key)));
  const applied = parseApplied(await store.applyResults(learnerId, results.map(toApplyRow), ENGINE_VERSION));
  return { learnerId, results, applied };
}

/** "Tính lại từ đầu" (§3 step 6): re-project the state from the book, then run the engine on every skill. Twice in a row → the same state, no new row. */
export async function rebuildLearner(store: EngineStore, learnerId: string, byMemberId: string): Promise<RecomputeSummary> {
  await store.resetStates(learnerId, byMemberId);
  return recomputeLearner(store, learnerId, null);
}

/** PostgREST "function not found" (PGRST202) or Postgres undefined_function (42883): migration 0023 is not applied yet. */
export function isMissingFunction(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "PGRST202" || code === "42883";
}

/** Run after a successful write (D16). Never throws: the user's write already succeeded. */
export type EngineHook = (learnerId: string, targets: string[] | null) => Promise<void>;
export function makeEngineHook(store: () => EngineStore, log: (err: unknown) => Promise<void>): EngineHook {
  return async (learnerId, targets) => {
    try {
      await recomputeLearner(store(), learnerId, targets);
    } catch (err) {
      if (isMissingFunction(err)) return;
      await log(err);
    }
  };
}
