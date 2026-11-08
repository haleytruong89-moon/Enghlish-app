import "server-only";
import { ReviewDbError } from "@/lib/review/handlers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PointEngineStore } from "./runner";

/** The point-engine functions of migration 0027 through the service role. Call only after requireAccess (or after a write that passed it). */
export function createSupabasePointStore(): PointEngineStore {
  const call = async (fn: string, args: Record<string, unknown>): Promise<unknown> => {
    const { data, error } = await createAdminClient().rpc(fn, args);
    if (error) throw new ReviewDbError(error.code ?? "unknown", `${fn}: ${error.message ?? error.code ?? "error"}`);
    return data;
  };
  return {
    loadInputs: (learnerId, tags) => call("eng_point_inputs", { p_learner: learnerId, p_tags: tags }),
    applyResults: (learnerId, rows, engineVersion) => call("eng_apply_point_results", { p_learner: learnerId, p_results: rows, p_engine_version: engineVersion }),
    resetStates: (learnerId, byMemberId) => call("eng_reset_point_states", { p_learner: learnerId, p_by: byMemberId }),
  };
}
