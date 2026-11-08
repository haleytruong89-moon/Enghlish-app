import "server-only";
import { engineHook } from "./hook";
import { combineHooks } from "./combine";
import { pointHook } from "./points/hook";

/**
 * The hook the route glue hands to write handlers whose write can change evidence: recompute the child's SKILLS (S7a, for the given targets)
 * and the child's knowledge POINTS (W3, every point: a write may touch any tag). Both are fail-soft; the user's write already succeeded.
 */
export function writeHook(route: string, userId: string | null) {
  return combineHooks(engineHook(route, userId), (learnerId) => pointHook(route, userId)(learnerId, null));
}
