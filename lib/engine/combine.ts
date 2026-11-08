/** Run several fail-soft hooks one after the other for the same write (each one never throws). Pure. */
import type { EngineHook } from "./runner";

export function combineHooks(...hooks: EngineHook[]): EngineHook {
  return async (learnerId, targets) => {
    for (const h of hooks) await h(learnerId, targets);
  };
}
