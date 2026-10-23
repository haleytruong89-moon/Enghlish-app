// lib/skills/supabaseStore.ts
import "server-only";
import { ReviewDbError } from "@/lib/review/handlers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SkillStore } from "./handlers";

/** The S7a staff functions of migration 0023 through the service role; only after the handler ran requireAccess / requireStaff. */
export function createSupabaseSkillStore(): SkillStore {
  const call = async (fn: string, args: Record<string, unknown>): Promise<unknown> => {
    const { data, error } = await createAdminClient().rpc(fn, args);
    if (error) throw new ReviewDbError(error.code ?? "unknown", `${fn}: ${error.message ?? error.code ?? "error"}`);
    return data;
  };
  return {
    async getDecisionLearnerId(id) {
      const { data, error } = await createAdminClient().from("mastery_decisions").select("learner_id").eq("id", id).maybeSingle<{ learner_id: string }>();
      if (error) throw new ReviewDbError(error.code ?? "unknown", `mastery_decisions lookup: ${error.message ?? error.code ?? "error"}`);
      return data?.learner_id ?? null;
    },
    states: (learnerId) => call("eng_skill_states", { p_learner: learnerId }),
    inbox: (a) => call("eng_skill_inbox", { p_by: a.byMemberId, p_allow_real: a.allowReal }),
    decide: (a) => call("eng_decide_skill", { p_decision: a.decisionId, p_action: a.action, p_reason: a.reason, p_by: a.byMemberId, p_client_id: a.clientId }),
    confirmAll: (a) => call("eng_confirm_skill_proposals", { p_learner: a.learnerId, p_ids: a.ids, p_by: a.byMemberId, p_client_id: a.clientId }),
    setManual: (a) =>
      call("eng_set_skill_state", { p_learner: a.learnerId, p_target: a.targetKey, p_state: a.state, p_reason: a.reason, p_by: a.byMemberId, p_client_id: a.clientId }),
  };
}
