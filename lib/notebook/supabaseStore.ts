import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReviewDbError } from "@/lib/review/handlers";
import type { LookupStore } from "./lookup";

function dbError(what: string, err: { code?: string; message?: string }): never {
  throw new ReviewDbError(err.code ?? "unknown", `${what}: ${err.message ?? err.code ?? "error"}`);
}

/**
 * Service-role calls of 0041, made ONLY by the routes after they took the signed-in user from the session (never from the request).
 * eng_lookup_context / eng_record_tutor_ask check again that this user is a child and find the child from it.
 */
export function createSupabaseLookupStore(): LookupStore {
  const db = () => createAdminClient();
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db().rpc(fn, args);
    if (error) dbError(fn, error);
    return data as unknown;
  };
  const card = (raw: unknown) => (raw && typeof raw === "object" && "id" in raw ? (raw as { id: string; content: unknown }) : null);
  return {
    context: (a) => call("eng_lookup_context", { p_user: a.userId, p_client_id: a.clientId, p_ask: a.askId ?? null }),
    findCard: async (a) => card(await call("eng_vocab_card_find", { p_word: a.word, p_band: a.band, p_language: a.language })),
    cardById: async (id) => card(await call("eng_vocab_card_by_id", { p_card: id })),
    saveCard: async (a) =>
      String(await call("eng_save_vocab_card", { p_band: a.band, p_language: a.language, p_content: a.content, p_prompt_version: a.promptVersion, p_model: a.model, p_supersedes: a.supersedes })),
    ipa: async (words) => ((await call("eng_ipa_for", { p_words: words })) as { word: string; accent: string; ipa: string[] }[] | null) ?? [],
    gate: (a) => call("eng_ai_gate", { p_learner: a.learnerId, p_estimate: a.estimate, p_reserve: true, p_draft: null, p_model: a.model, p_by: null, p_purpose: a.purpose }),
    logRun: async (a) =>
      String(
        await call("eng_log_ai_run", {
          p_family: a.familyId, p_draft: null, p_model: a.model, p_prompt_version: a.promptVersion, p_input: a.input, p_output: a.output, p_cost: a.cost,
          p_status: a.status, p_error: a.error, p_by: null, p_release: a.release, p_purpose: a.purpose,
        }),
      ),
    record: async (a) =>
      (await call("eng_record_tutor_ask", {
        p_user: a.userId, p_kind: a.kind, p_child_text: a.childText, p_context_text: a.contextText, p_card: a.cardId, p_sense: a.sense, p_parent_ask: a.parentAsk,
        p_shown_text: a.shown, p_guard: a.guard, p_reasons: a.reasons, p_flags: a.flags, p_fixed_code: a.fixedCode, p_used_ai: a.usedAi,
        p_prompt_version: a.promptVersion, p_model: a.model, p_runs: a.runs, p_cost: a.cost, p_client_id: a.clientId,
      })) as { id: string; replayed: boolean },
  };
}
