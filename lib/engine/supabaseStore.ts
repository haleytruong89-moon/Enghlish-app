import "server-only";
import { ReviewDbError } from "@/lib/review/handlers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EngineStore } from "./runner";

/** The engine functions of migration 0023 through the service role. Call only after requireAccess (or after a write that passed it). */
export function createSupabaseEngineStore(): EngineStore {
  const call = async (fn: string, args: Record<string, unknown>): Promise<unknown> => {
    const { data, error } = await createAdminClient().rpc(fn, args);
    if (error) throw new ReviewDbError(error.code ?? "unknown", `${fn}: ${error.message ?? error.code ?? "error"}`);
    return data;
  };
  return {
    loadInputs: (learnerId, targets) => call("eng_engine_inputs", { p_learner: learnerId, p_targets: targets }),
    applyResults: (learnerId, rows, engineVersion) => call("eng_apply_engine_results", { p_learner: learnerId, p_results: rows, p_engine_version: engineVersion }),
    resetStates: (learnerId, byMemberId) => call("eng_reset_skill_states", { p_learner: learnerId, p_by: byMemberId }),
  };
}
