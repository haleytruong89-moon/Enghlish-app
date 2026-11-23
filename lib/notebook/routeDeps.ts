import "server-only";
import { createToolCaller } from "@/lib/ai/anthropic";
import { TUTOR_NOTICE_VERSION } from "@/lib/ai/config";
import { loadPrompt } from "@/lib/ai/prompts";
import { notebookModels } from "@/lib/tutor/config";
import type { LookupDeps } from "./lookup";
import { AGAIN_PROMPT, CARD_CHECK_PROMPT, CARD_PROMPT, SENSE_PROMPT } from "./prompt";
import { createSupabaseLookupStore } from "./supabaseStore";

/** The real dependencies of a lookup / explain-again turn (server only). */
export function lookupDeps(): LookupDeps {
  const caller = createToolCaller();
  return {
    store: createSupabaseLookupStore(),
    noticeVersion: TUTOR_NOTICE_VERSION,
    call: (c, o) => caller(c, { timeoutMs: o?.timeoutMs ?? 45_000 }),
    prompts: { card: loadPrompt(CARD_PROMPT.file), check: loadPrompt(CARD_CHECK_PROMPT.file), sense: loadPrompt(SENSE_PROMPT.file), again: loadPrompt(AGAIN_PROMPT.file) },
    models: notebookModels(),
  };
}
