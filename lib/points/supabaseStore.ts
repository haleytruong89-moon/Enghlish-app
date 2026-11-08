// lib/points/supabaseStore.ts
import "server-only";
import { ReviewDbError } from "@/lib/review/handlers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PointStore } from "./handlers";

/** The W3 staff functions of migration 0027 through the service role; only after the handler ran requireAccess / requireStaff. */
export function createSupabasePointsStore(): PointStore {
  const call = async (fn: string, args: Record<string, unknown>): Promise<unknown> => {
    const { data, error } = await createAdminClient().rpc(fn, args);
    if (error) throw new ReviewDbError(error.code ?? "unknown", `${fn}: ${error.message ?? error.code ?? "error"}`);
    return data;
  };
  return {
    async getDecisionLearnerId(id) {
      const { data, error } = await createAdminClient().from("point_decisions").select("learner_id").eq("id", id).maybeSingle<{ learner_id: string }>();
      if (error) throw new ReviewDbError(error.code ?? "unknown", `point_decisions lookup: ${error.message ?? error.code ?? "error"}`);
      return data?.learner_id ?? null;
    },
    map: (learnerId) => call("eng_point_map", { p_learner: learnerId }),
    inbox: (a) => call("eng_point_inbox", { p_by: a.byMemberId, p_allow_real: a.allowReal }),
    decide: (a) => call("eng_decide_point", { p_decision: a.decisionId, p_action: a.action, p_reason: a.reason, p_by: a.byMemberId, p_client_id: a.clientId }),
  };
}
