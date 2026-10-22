import "server-only";
import { ReviewDbError } from "@/lib/review/handlers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LevelStore } from "./handlers";

/** Calls the service-role functions of migration 0020, only after the handler ran requireAccess (the SQL checks the actor again). */
export function createSupabaseLevelStore(): LevelStore {
  const call = async (fn: string, args: Record<string, unknown>): Promise<unknown> => {
    const { data, error } = await createAdminClient().rpc(fn, args);
    if (error) throw new ReviewDbError(error.code ?? "unknown", `${fn}: ${error.message ?? error.code ?? "error"}`);
    return data;
  };
  return {
    recordLevels: (a) =>
      call("eng_record_level", { p_learner: a.learnerId, p_kind: a.kind, p_levels: a.levels, p_reason: a.reason, p_by: a.byMemberId, p_client_id: a.clientId }),
    recordExternal: (a) =>
      call("eng_record_external_result", {
        p_learner: a.learnerId, p_exam: a.exam, p_taken_on: a.takenOn, p_score_text: a.scoreText, p_domains: a.domains, p_note: a.note,
        p_file: a.file, p_by: a.byMemberId, p_client_id: a.clientId, p_supersedes: a.supersedesId,
      }),
  };
}
