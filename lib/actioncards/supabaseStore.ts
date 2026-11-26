import "server-only";
import { ReviewDbError } from "@/lib/review/handlers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingFunction } from "./errors";
import type { ActionCardStore } from "./handlers";

/** Calls the service-role function of migration 0043 only after the handler ran requireAccess (the SQL checks the actor again). */
export function createSupabaseActionCardStore(): ActionCardStore {
  return {
    async decide({ learnerId, cardKey, kind, label, evidenceAt, decision, reason, byMemberId, clientId }) {
      const { data, error } = await createAdminClient().rpc("eng_decide_action_card", {
        p_learner: learnerId, p_card_key: cardKey, p_kind: kind, p_label: label, p_evidence_at: evidenceAt, p_decision: decision, p_reason: reason, p_by: byMemberId, p_client_id: clientId,
      });
      if (error) {
        // Before migration 0043 is applied the function is missing: one clear answer instead of a 500.
        if (isMissingFunction(error.code)) throw new ReviewDbError("cards_unavailable", "eng_decide_action_card is missing: apply migration 0043");
        throw new ReviewDbError(error.code ?? "unknown", `eng_decide_action_card: ${error.message ?? error.code ?? "error"}`);
      }
      return data;
    },
  };
}
