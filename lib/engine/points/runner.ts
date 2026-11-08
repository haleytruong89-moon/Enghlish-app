/** The server side of the point engine: load → compute every point → apply. Pure of any framework; the stores do the I/O. */
import { computePointLevel } from "./compute";
import { parsePointApplied, parsePointInputs, slicePoint, toPointApplyRow, type PointApplied, type PointApplyRow } from "./shape";
import { POINT_ENGINE_VERSION, type PointEngineResult } from "./types";

/** The point-engine functions of migration 0027 (service role; always after requireAccess or after a write that passed it). */
export interface PointEngineStore {
  loadInputs(learnerId: string, tags: string[] | null): Promise<unknown>;
  applyResults(learnerId: string, rows: PointApplyRow[], engineVersion: string): Promise<unknown>;
  resetStates(learnerId: string, byMemberId: string): Promise<unknown>;
}

export type PointRecomputeSummary = { learnerId: string; results: PointEngineResult[]; applied: PointApplied };
const NOTHING: PointApplied = { auto: 0, proposed: 0, flagged: 0, policyVersion: null };

/** Recompute the points of one child (null = every point with evidence, taught or in the book) and write the outcome. */
export async function recomputePoints(store: PointEngineStore, learnerId: string, tags: string[] | null = null): Promise<PointRecomputeSummary> {
  const inputs = parsePointInputs(await store.loadInputs(learnerId, tags));
  if (inputs.policy === null || inputs.points.length === 0) return { learnerId, results: [], applied: NOTHING };
  const results = inputs.points.map((p) => computePointLevel(slicePoint(inputs, p.tag_key)));
  const applied = parsePointApplied(await store.applyResults(learnerId, results.map((r) => toPointApplyRow(r, inputs.now)), POINT_ENGINE_VERSION));
  return { learnerId, results, applied };
}

/** The evidence key of ONE point as the engine sees it now (what a tutor is looking at when setting a level by hand). */
export async function pointEvidenceKeyFor(store: PointEngineStore, learnerId: string, tag: string): Promise<string | null> {
  const inputs = parsePointInputs(await store.loadInputs(learnerId, [tag]));
  if (inputs.policy === null || !inputs.points.some((p) => p.tag_key === tag)) return null;
  return computePointLevel(slicePoint(inputs, tag)).evidenceKey;
}

/** "Tính lại từ đầu": re-project the state from the book, then run the engine on every point. Twice in a row → the same state, no new row. */
export async function rebuildPoints(store: PointEngineStore, learnerId: string, byMemberId: string): Promise<PointRecomputeSummary> {
  await store.resetStates(learnerId, byMemberId);
  return recomputePoints(store, learnerId, null);
}

/** Run after a successful write. Never throws: the user's write already succeeded. */
export type PointHook = (learnerId: string, tags: string[] | null) => Promise<void>;
export function makePointHook(store: () => PointEngineStore, log: (err: unknown) => Promise<void>, isMissing: (err: unknown) => boolean): PointHook {
  return async (learnerId, tags) => {
    try {
      await recomputePoints(store(), learnerId, tags);
    } catch (err) {
      if (isMissing(err)) return;
      await log(err);
    }
  };
}
