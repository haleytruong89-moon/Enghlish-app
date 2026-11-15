import "server-only";
import { ReviewDbError } from "@/lib/review/handlers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { createSupabaseWorkStore } from "@/lib/work/supabaseStore";
import { isMissingFunction } from "./errors";
import type { GoalStore } from "./handlers";

function dbError(what: string, err: { code?: string; message?: string }): never {
  // Before migration 0035 is applied the functions are missing: one clear answer instead of a 500.
  if (isMissingFunction(err.code)) throw new ReviewDbError("goal_unavailable", `${what} is missing: apply migration 0035`);
  throw new ReviewDbError(err.code ?? "unknown", `${what}: ${err.message ?? err.code ?? "error"}`);
}

/**
 * The child's two writes go through the USER client (the functions identify the child by auth.uid(); the service role is never used for them).
 * The tutor's decision calls the service-role function, only after the handler ran requireAccess; the SQL checks the actor again.
 */
export function createSupabaseGoalStore(): GoalStore {
  return {
    getOwnProfile: (userId) => createSupabaseWorkStore().getOwnProfile(userId),
    async propose({ pieces, clientId }) {
      const { data, error } = await (await createUserClient()).rpc("eng_my_propose_goal", { p_pieces: pieces, p_client_id: clientId });
      if (error) dbError("eng_my_propose_goal", error);
      return data;
    },
    async withdraw({ goalId, clientId }) {
      const { data, error } = await (await createUserClient()).rpc("eng_my_withdraw_goal", { p_goal: goalId, p_client_id: clientId });
      if (error) dbError("eng_my_withdraw_goal", error);
      return data;
    },
    async decide({ goalId, action, pieces, byMemberId, clientId, learnerId }) {
      const { data, error } = await createAdminClient().rpc("eng_decide_goal", { p_goal: goalId, p_action: action, p_pieces: pieces, p_by: byMemberId, p_client_id: clientId, p_learner: learnerId });
      if (error) dbError("eng_decide_goal", error);
      return data;
    },
  };
}
