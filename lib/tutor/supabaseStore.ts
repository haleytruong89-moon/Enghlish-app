import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReviewDbError } from "@/lib/review/handlers";
import type { TutorStore } from "./turn";

/** The database keeps its "(tag)" in the message so the turn can explain it; it is never sent to the browser. */
function dbError(what: string, err: { code?: string; message?: string }): never {
  throw new ReviewDbError(err.code ?? "unknown", `${what}: ${err.message ?? err.code ?? "error"}`);
}

/**
 * Service-role calls of 0039, made ONLY by the route after it took the signed-in user from the session (never from the request).
 * Every function checks again that this user is the child who owns the step (eng_tutor_context / eng_record_tutor_turn).
 */
export function createSupabaseTutorStore(): TutorStore {
  const db = () => createAdminClient();
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db().rpc(fn, args);
    if (error) dbError(fn, error);
    return data as unknown;
  };
  return {
    context: (a) => call("eng_tutor_context", { p_user: a.userId, p_activity: a.activityId, p_item: a.itemId, p_client_id: a.clientId }),
    gate: (a) => call("eng_ai_gate", { p_learner: a.learnerId, p_estimate: a.estimate, p_reserve: true, p_draft: null, p_model: a.model, p_by: null, p_purpose: "tutor_hint" }),
    logRun: async (a) =>
      String(
        await call("eng_log_ai_run", {
          p_family: a.familyId, p_draft: null, p_model: a.model, p_prompt_version: a.promptVersion, p_input: a.input, p_output: a.output, p_cost: a.cost,
          p_status: a.status, p_error: a.error, p_by: null, p_release: a.release, p_purpose: a.purpose,
        }),
      ),
    record: (a) =>
      call("eng_record_tutor_turn", {
        p_user: a.userId, p_activity: a.activityId, p_item: a.itemId, p_kind: a.kind, p_child_text: a.childText, p_shown: a.shown, p_guard: a.guard,
        p_reasons: a.reasons, p_flags: a.flags, p_fixed_code: a.fixedCode, p_prompt_version: a.promptVersion, p_model: a.model, p_runs: a.runs, p_cost: a.cost,
        p_client_id: a.clientId,
      }),
  };
}
