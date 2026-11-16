import "server-only";
import { ReviewDbError } from "@/lib/review/handlers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingFunction } from "./errors";
import type { ThenNowStore } from "./handlers";

/** Calls the service-role function of migration 0036 only after the handler ran requireAccess (the SQL checks the actor again). */
export function createSupabaseThenNowStore(): ThenNowStore {
  return {
    async pick({ learnerId, thenId, nowId, note, status, byMemberId, clientId }) {
      const { data, error } = await createAdminClient().rpc("eng_pick_then_now", {
        p_learner: learnerId, p_then: thenId, p_now: nowId, p_note: note, p_status: status, p_by: byMemberId, p_client_id: clientId,
      });
      if (error) {
        // Before migration 0036 is applied the function is missing: one clear answer instead of a 500.
        if (isMissingFunction(error.code)) throw new ReviewDbError("thennow_unavailable", "eng_pick_then_now is missing: apply migration 0036");
        throw new ReviewDbError(error.code ?? "unknown", `eng_pick_then_now: ${error.message ?? error.code ?? "error"}`);
      }
      return data;
    },
  };
}
