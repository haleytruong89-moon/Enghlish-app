import "server-only";
import { ReviewDbError } from "@/lib/review/handlers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RevisionStore } from "./handlers";

/** Calls a service-role function of migration 0021. Only after requireAccess (the SQL re-checks the actor). */
export async function callRevisionRpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await createAdminClient().rpc(fn, args);
  if (error) throw new ReviewDbError(error.code ?? "unknown", `${fn}: ${error.message ?? error.code ?? "error"}`);
  return data;
}

export function createSupabaseRevisionStore(): RevisionStore {
  return {
    async getAttemptLearnerId(id) {
      const { data, error } = await createAdminClient().from("attempts").select("learner_id").eq("id", id).maybeSingle<{ learner_id: string }>();
      if (error) throw new ReviewDbError(error.code ?? "unknown", `attempts lookup: ${error.message ?? "error"}`);
      return data?.learner_id ?? null;
    },
    writeFeedback: (a) =>
      callRevisionRpc("eng_write_feedback", {
        p_source_attempt: a.attemptId, p_praise: a.praise, p_items: a.items, p_requires_revision: a.requiresRevision, p_supersedes: a.supersedesId,
        p_by: a.byMemberId, p_client_id: a.clientId,
      }),
    finishRevision: (a) =>
      callRevisionRpc("eng_finish_revision", {
        p_attempt: a.attemptId, p_action: a.action, p_checks: a.checks, p_closing: a.closingNote, p_praise: a.praise, p_items: a.items,
        p_by: a.byMemberId, p_client_id: a.clientId,
      }),
  };
}
