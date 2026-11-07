import "server-only";
import { ReviewDbError } from "@/lib/review/handlers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { WorkdeskStore } from "./handlers";

/** Calls the service-role functions of migration 0025, only after the handler ran its access check (the SQL checks the actor again). */
export function createSupabaseWorkdeskStore(): WorkdeskStore {
  const call = async (fn: string, args: Record<string, unknown>): Promise<unknown> => {
    const { data, error } = await createAdminClient().rpc(fn, args);
    if (error) throw new ReviewDbError(error.code ?? "unknown", `${fn}: ${error.message ?? error.code ?? "error"}`);
    return data;
  };
  return {
    familyHasRealLearner: async (familyId) => {
      const { data, error } = await createAdminClient().from("learners").select("id").eq("family_id", familyId).eq("is_test", false).limit(1);
      if (error) throw new ReviewDbError(error.code ?? "unknown", `learners lookup: ${error.message ?? error.code ?? "error"}`);
      return (data ?? []).length > 0;
    },
    writeNote: (a) => call("eng_write_teaching_note", { p_learner: a.learnerId, p_field: a.field, p_text: a.text, p_by: a.byMemberId, p_client_id: a.clientId }),
    writeIntake: (a) => call("eng_write_intake", { p_learner: a.learnerId, p_content: a.content, p_by: a.byMemberId, p_client_id: a.clientId }),
    sendFeedback: (a) => call("eng_send_app_feedback", { p_kind: a.kind, p_screen: a.screen, p_text: a.text, p_by: a.byMemberId, p_client_id: a.clientId }),
    updateFeedback: (a) => call("eng_update_app_feedback", { p_feedback: a.feedbackId, p_status: a.status, p_reply: a.reply, p_by: a.byMemberId, p_client_id: a.clientId }),
  };
}
