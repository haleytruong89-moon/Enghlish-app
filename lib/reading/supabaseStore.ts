import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReviewDbError } from "@/lib/review/handlers";
import type { ReadingStore } from "./handlers";

/** Calls the service-role function of migration 0018, only after the handler ran requireAccess. */
export function createSupabaseReadingStore(): ReadingStore {
  return {
    async recordReport(a) {
      const { data, error } = await createAdminClient().rpc("eng_record_reading_report", {
        p_learner: a.learnerId,
        p_month: a.month,
        p_source: a.source,
        p_rows: a.rows,
        p_note: a.note,
        p_supersedes: a.supersedes,
        p_by: a.byMemberId,
        p_client_id: a.clientId,
      });
      if (error) throw new ReviewDbError(error.code ?? "unknown", `eng_record_reading_report: ${error.message ?? error.code ?? "error"}`);
      return data;
    },
  };
}
