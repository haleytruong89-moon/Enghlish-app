import "server-only";
import { z } from "zod";
import { cardContentSchema, type CardView } from "@/lib/notebook/card";
import { buildCardView, headwordWords, type IpaRow } from "@/lib/notebook/view";
import { createUserClient } from "@/lib/supabase/server";

/** E2a · reads of the Gia sư and Sổ tay pages (child) and of one card (child or adult). USER client + 0041 functions; null = not applied. */

const MISSING = new Set(["PGRST202", "42883"]);
async function rpc(fn: string, args?: Record<string, unknown>): Promise<unknown | undefined> {
  const { data, error } = await (await createUserClient()).rpc(fn, args);
  if (error) {
    if (error.code && MISSING.has(error.code)) return undefined;
    throw new Error(`${fn} failed: ${error.code ?? "error"}`);
  }
  return data as unknown;
}

const num = z.union([z.number(), z.string()]).transform(Number);
const statusSchema = z.object({
  language: z.string().nullable(), band: z.string().nullable(), lookups_today: num, lookup_limit: num,
  consent_version: z.string().nullable(), ai_enabled: z.boolean(),
});
export type TutorStatus = { language: string; band: string; lookupsToday: number; lookupLimit: number; consentVersion: string | null; aiEnabled: boolean };
const recentSchema = z.array(z.object({ ask_id: z.string(), headword: z.string(), card_id: z.string(), at: z.string() }));
export type RecentLookup = { askId: string; headword: string; cardId: string; at: string };
const notebookSchema = z.array(z.object({ item_id: z.string(), card_id: z.string(), headword: z.string(), meaning: z.string().nullable(), saved_at: z.string(), state: z.enum(["active", "removed"]) }));
export type NotebookRow = { itemId: string; cardId: string; headword: string; meaning: string | null; savedAt: string; state: "active" | "removed" };

export async function loadTutorPage(): Promise<{ status: TutorStatus; recent: RecentLookup[] } | null> {
  const [s, r] = await Promise.all([rpc("eng_my_tutor_status"), rpc("eng_my_recent_lookups", { p_limit: 5 })]);
  if (s === undefined || s === null) return null;
  const st = statusSchema.parse(s);
  return {
    status: { language: st.language ?? "vi", band: st.band ?? "", lookupsToday: st.lookups_today, lookupLimit: st.lookup_limit, consentVersion: st.consent_version, aiEnabled: st.ai_enabled },
    recent: recentSchema.parse(r ?? []).map((x) => ({ askId: x.ask_id, headword: x.headword, cardId: x.card_id, at: x.at })),
  };
}

export async function loadNotebook(): Promise<NotebookRow[] | null> {
  const raw = await rpc("eng_my_notebook", { p_kind: "word" });
  if (raw === undefined || raw === null) return null;
  return notebookSchema.parse(raw).map((x) => ({ itemId: x.item_id, cardId: x.card_id, headword: x.headword, meaning: x.meaning, savedAt: x.saved_at, state: x.state }));
}

/**
 * One card with IPA from the table; null = not found / not applied / unreadable. Default: the current version of its chain (the child's
 * Sổ tay); `exact`: that very version (adults reading the card the child saw).
 */
export async function loadCardView(cardId: string, o: { exact?: boolean } = {}): Promise<CardView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(cardId)) return null;
  const raw = (await rpc("eng_my_vocab_card", { p_card: cardId, p_exact: o.exact === true })) as { id?: string; content?: unknown } | null | undefined;
  if (!raw?.id) return null;
  const content = cardContentSchema.safeParse(raw.content);
  if (!content.success) return null;
  const rows = ((await rpc("eng_ipa_for", { p_words: headwordWords(content.data.headword) })) ?? []) as IpaRow[];
  return buildCardView(raw.id, content.data, null, rows);
}
