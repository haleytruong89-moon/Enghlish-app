/**
 * E2a · one turn of "Tra từ" (spec §5) and of "Chưa hiểu, giải thích cách khác" (§4.5). Pure orchestration with an injected store and
 * model caller, the same discipline as the E1 turn (lib/tutor/turn.ts):
 *   input rules → context (child only, replay by client id, daily counts) → daily limit → blocked words → cached card (no model; with the
 *   child's sentence Haiku only picks a sense number) → AI gate (consent v3, AI limit, priced models, reservation) → Sonnet card → code
 *   checks → Haiku check → one rewrite → else a fixed sentence → save card → ledger at the end → record the ask.
 * The child only ever gets a card that passed both checks, a cached card, or a fixed sentence. IPA is built by code (L3).
 * Model errors never become a 500.
 */
import { z } from "zod";
import { parseGate } from "@/lib/ai/cap";
import { estimateCostUsd, isPricedModel } from "@/lib/ai/pricing";
import { AiCallError, estimateInputTokens, type ToolCall, type ToolResult } from "@/lib/ai/request";
import { ReviewDbError } from "@/lib/review/handlers";
import { cardCodeReasons, cardContentSchema, cardToolOutputSchema, IPA_LIKE, linesOf, type CardContent, type CardView } from "./card";
import { checkLookupInput, isBlocked } from "./input";
import { buildCardView, headwordWords } from "./view";
import { AGAIN_PROMPT, buildAgainCall, buildCardCall, buildCardCheckCall, buildSenseCall, CARD_CHECK_PROMPT, CARD_PROMPT, SENSE_PROMPT } from "./prompt";

/** Worst case of one lookup (two Sonnet cards with room to think + two Haiku checks), reserved before the first call. */
export const LOOKUP_RESERVE_USD = 0.08;
export const TURN_BUDGET_MS = 55_000;
const CALL_MAX_MS = 45_000;
const CALL_MIN_MS = 5_000;
const MAYBE_BILLED = new Set(["timeout", "network", "http_5xx"]);

export type LookupFixed = "daily_limit" | "ai_daily_limit" | "blocked" | "ai_off" | "card_failed" | "ai_error" | "not_word";
type Purpose = "vocab_card" | "vocab_check" | "vocab_sense" | "vocab_again";
type ReservePurpose = Exclude<Purpose, "vocab_check">;

export type LookupStore = {
  context(a: { userId: string; clientId: string; askId?: string }): Promise<unknown>;
  findCard(a: { word: string; band: string; language: string }): Promise<{ id: string; content: unknown } | null>;
  cardById(id: string): Promise<{ id: string; content: unknown } | null>;
  saveCard(a: { band: string; language: string; content: CardContent; promptVersion: string; model: string; supersedes: string | null }): Promise<string>;
  ipa(words: string[]): Promise<{ word: string; accent: string; ipa: string[] }[]>;
  gate(a: { learnerId: string; estimate: number; model: string; purpose: ReservePurpose }): Promise<unknown>;
  logRun(a: { familyId: string; model: string; promptVersion: string; input: number; output: number; cost: number; status: "ok" | "error"; error: string | null; release: string | null; purpose: Purpose }): Promise<string>;
  record(a: {
    userId: string; kind: "lookup" | "again"; childText: string; contextText: string | null; cardId: string | null; sense: number | null; parentAsk: string | null;
    shown: string | null; guard: "cache" | "pass" | "rewritten" | "fixed"; reasons: string[]; flags: string[]; fixedCode: LookupFixed | null; usedAi: boolean;
    promptVersion: string | null; model: string | null; runs: string[]; cost: number; clientId: string;
  }): Promise<{ id: string; replayed: boolean }>;
};

export type LookupDeps = {
  store: LookupStore;
  /** The consent text version the tutor page needs (lib/ai/config TUTOR_NOTICE_VERSION). */
  noticeVersion: string;
  call: (c: ToolCall, o?: { timeoutMs?: number }) => Promise<ToolResult>;
  now?: () => number;
  prompts: { card: string; check: string; sense: string; again: string };
  models: { card: string; check: string; toolChoice?: "tool" | "auto" };
};

export type AgainView = { angle: string; core: string; examples: { en: string; vi: string }[]; task: string };
export type LookupBody =
  | { kind: "card"; askId: string; card: CardView; replayed: boolean }
  | { kind: "not_word"; askId: string; suggestions: string[]; replayed: boolean }
  | { kind: "fixed"; askId: string | null; fixed: LookupFixed; replayed: boolean }
  | { kind: "again"; askId: string; again: AgainView; replayed: boolean };
export type LookupResult = { status: 200 | 201 | 400 | 404 | 409; body: LookupBody | { error: string } };

const num = z.union([z.number(), z.string()]).transform(Number);
const ctxSchema = z.object({
  learner_id: z.string(), family_id: z.string(), language: z.string().nullable(), band: z.string().nullable(),
  lookups_today: num, lookup_limit: num, ai_lookups_today: num, ai_lookup_limit: num, consent_version: z.string().nullable(),
  ask: z.object({ id: z.string(), card_id: z.string() }).nullable().optional(),
});
const replaySchema = z.object({
  replay: z.object({ id: z.string(), kind: z.enum(["lookup", "again"]), card_id: z.string().nullable(), sense: num.nullable(), guard: z.string(), shown_text: z.string().nullable(), fixed_code: z.string().nullable() }),
});
const checkOut = z.object({ pass: z.boolean(), reasons: z.array(z.string()).default([]) });
const senseOut = z.object({ index: z.number().int().min(-1).max(2) });
const againOut = z.object({
  angle: z.string().trim().min(1).max(20), core: z.string().trim().min(1).max(160),
  examples: z.array(z.object({ en: z.string().trim().min(1).max(160), vi: z.string().trim().min(1).max(160) })).length(2), task: z.string().trim().min(1).max(200),
});
const SUGGESTION = /^[a-z' -]{1,40}$/;
/** A sentence that tries to talk to the model instead of showing the word (flag only; the turn is the same). */
const INJECTION = /ignore (all |your |the |previous )*(rules|instructions)|system\s*:|system prompt|you are now|[<>]{3}|bỏ qua (mọi |các )?(luật|quy tắc)/i;

function dbTag(err: unknown): LookupResult | null {
  if (!(err instanceof ReviewDbError)) return null;
  const tag = /\(([a-z_]+)\)\s*$/.exec(err.detail)?.[1];
  if (tag === "not_child" || tag === "not_found") return { status: 404, body: { error: "not_found" } };
  if (err.code === "PGRST202" || err.code === "42883") return { status: 409, body: { error: "notebook_unavailable" } };
  return null;
}

/** The card + IPA (code, from ipa_lexicon) + the sense of the child's sentence. */
async function viewOf(store: LookupStore, cardId: string, content: CardContent, sense: number | null): Promise<CardView> {
  const words = headwordWords(content.headword);
  const rows = words.length <= 8 ? await store.ipa(words).catch(() => []) : [];
  return buildCardView(cardId, content, sense, rows);
}

/** Ledger + timed calls of one turn; everything written at the end, the reservation released by the last run of its purpose. */
function meter(deps: LookupDeps, familyId: string) {
  const now = deps.now ?? Date.now;
  const deadline = now() + TURN_BUDGET_MS;
  type Pending = { model: string; promptVersion: string; purpose: Purpose; input: number; output: number; cost: number; error: string | null };
  const pending: Pending[] = [];
  const runs: string[] = [];
  let cost = 0;
  const log = (c: ToolCall, promptVersion: string, purpose: Purpose, usage: { inputTokens: number; outputTokens: number }, error: string | null) => {
    const billed = error && MAYBE_BILLED.has(error) && usage.inputTokens === 0 && usage.outputTokens === 0 ? { inputTokens: estimateInputTokens(c), outputTokens: c.maxTokens } : usage;
    const usd = estimateCostUsd(c.model, billed.inputTokens, billed.outputTokens);
    cost += usd;
    pending.push({ model: c.model, promptVersion, purpose, input: billed.inputTokens, output: billed.outputTokens, cost: usd, error });
  };
  const call = async (c: ToolCall, promptVersion: string, purpose: Purpose): Promise<unknown | null> => {
    const left = deadline - now();
    if (left < CALL_MIN_MS) return null;
    try {
      const res = await deps.call(c, { timeoutMs: Math.min(CALL_MAX_MS, left) });
      log(c, promptVersion, purpose, res.usage, null);
      return res.input;
    } catch (err) {
      log(c, promptVersion, purpose, err instanceof AiCallError ? err.usage : { inputTokens: 0, outputTokens: 0 }, err instanceof AiCallError ? err.code : "error");
      return null;
    }
  };
  const flush = async (reservation: string | null, reservedFor: ReservePurpose) => {
    const releaseAt = pending.map((p) => p.purpose).lastIndexOf(reservedFor);
    for (let i = 0; i < pending.length; i++) {
      const p = pending[i]!;
      runs.push(await deps.store.logRun({
        familyId, model: p.model, promptVersion: p.promptVersion, input: p.input, output: p.output, cost: p.cost,
        status: p.error ? "error" : "ok", error: p.error, release: i === releaseAt ? reservation : null, purpose: p.purpose,
      }));
    }
  };
  return { call, flush, runs, get cost() { return cost; }, get used() { return pending.length > 0; } };
}

export async function runLookup(deps: LookupDeps, input: { userId: string; word: string; context: string | null; clientId: string }): Promise<LookupResult> {
  const checked = checkLookupInput(input.word, input.context);
  if (!checked.ok) return { status: 400, body: { error: checked.code } };
  const { headword, context } = checked;

  let raw: unknown;
  try {
    raw = await deps.store.context({ userId: input.userId, clientId: input.clientId });
  } catch (err) {
    const mapped = dbTag(err);
    if (mapped) return mapped;
    throw err;
  }
  const replay = replaySchema.safeParse(raw);
  if (replay.success) return replayed(deps, replay.data.replay);
  const ctx = ctxSchema.parse(raw);
  const language = ctx.language ?? "vi";
  const band = ctx.band ?? "";
  const flags = context && INJECTION.test(context) ? ["injection_attempt"] : [];

  const record = (a: Omit<Parameters<LookupStore["record"]>[0], "userId" | "kind" | "childText" | "contextText" | "parentAsk" | "clientId" | "flags">) =>
    deps.store.record({ userId: input.userId, kind: "lookup", childText: headword, contextText: context, parentAsk: null, clientId: input.clientId, flags, ...a });
  const fixed = async (code: LookupFixed, spent: { usedAi: boolean; runs: string[]; cost: number; shown?: string | null } = { usedAi: false, runs: [], cost: 0 }): Promise<LookupResult> => {
    const r = await record({ cardId: null, sense: null, shown: spent.shown ?? null, guard: "fixed", reasons: [], fixedCode: code, usedAi: spent.usedAi, promptVersion: spent.usedAi ? CARD_PROMPT.version : null, model: spent.usedAi ? deps.models.card : null, runs: spent.runs, cost: spent.cost });
    return { status: r.replayed ? 200 : 201, body: { kind: "fixed", askId: r.id, fixed: code, replayed: r.replayed } };
  };

  if (ctx.lookups_today >= ctx.lookup_limit) return fixed("daily_limit");
  if (isBlocked(headword)) return fixed("blocked");

  const cached = await deps.store.findCard({ word: headword, band, language });
  const cachedCard = cached ? cardContentSchema.safeParse(cached.content) : null;
  const cachedOk = cached && cachedCard?.success ? { id: cached.id, card: cachedCard.data } : null;
  if (cachedOk && !context) {
    const r = await record({ cardId: cachedOk.id, sense: null, shown: null, guard: "cache", reasons: [], fixedCode: null, usedAi: false, promptVersion: null, model: null, runs: [], cost: 0 });
    return { status: r.replayed ? 200 : 201, body: { kind: "card", askId: r.id, card: await viewOf(deps.store, cachedOk.id, cachedOk.card, null), replayed: r.replayed } };
  }

  // A cached card is always better than "Gia sư đang nghỉ" when the AI cannot run (spec §8): shown without a sense.
  const cachedFallback = async (): Promise<LookupResult> => {
    const r = await record({ cardId: cachedOk!.id, sense: null, shown: null, guard: "cache", reasons: ["no_ai_for_sense"], fixedCode: null, usedAi: false, promptVersion: null, model: null, runs: [], cost: 0 });
    return { status: r.replayed ? 200 : 201, body: { kind: "card", askId: r.id, card: await viewOf(deps.store, cachedOk!.id, cachedOk!.card, null), replayed: r.replayed } };
  };
  // Everything below calls a model: consent v3, the AI limit of the day, priced models, the family gate with a reservation.
  const blocked: LookupFixed | null =
    ctx.consent_version !== deps.noticeVersion ? "ai_off"
      : ctx.ai_lookups_today >= ctx.ai_lookup_limit ? "ai_daily_limit"
        : !isPricedModel(deps.models.card) || !isPricedModel(deps.models.check) ? "ai_error"
          : null;
  if (blocked) return cachedOk ? cachedFallback() : fixed(blocked);
  const purpose: ReservePurpose = cachedOk ? "vocab_sense" : "vocab_card";
  const gate = parseGate(await deps.store.gate({ learnerId: ctx.learner_id, estimate: LOOKUP_RESERVE_USD, model: deps.models.card, purpose }));
  if (!gate.allowed) return cachedOk ? cachedFallback() : fixed("ai_off");
  const m = meter(deps, ctx.family_id);
  const tc = deps.models.toolChoice;

  // A cached card + the child's sentence: Haiku picks the sense (a number only).
  let supersedes: string | null = null;
  if (cachedOk && context) {
    const out = senseOut.safeParse(await m.call(buildSenseCall({ template: deps.prompts.sense, model: deps.models.check, word: headword, senses: cachedOk.card.senses, context, toolChoice: tc }), SENSE_PROMPT.version, "vocab_sense"));
    if (out.success && out.data.index >= 0 && out.data.index < cachedOk.card.senses.length) {
      await m.flush(gate.reservationId ?? null, "vocab_sense");
      const r = await record({ cardId: cachedOk.id, sense: out.data.index, shown: null, guard: "cache", reasons: [], fixedCode: null, usedAi: true, promptVersion: SENSE_PROMPT.version, model: deps.models.check, runs: m.runs, cost: m.cost });
      return { status: r.replayed ? 200 : 201, body: { kind: "card", askId: r.id, card: await viewOf(deps.store, cachedOk.id, cachedOk.card, out.data.index), replayed: r.replayed } };
    }
    if (!out.success) {
      // Haiku failed: show the cached card without a sense rather than spending on a new card.
      await m.flush(gate.reservationId ?? null, "vocab_sense");
      const r = await record({ cardId: cachedOk.id, sense: null, shown: null, guard: "cache", reasons: ["sense_failed"], fixedCode: null, usedAi: true, promptVersion: SENSE_PROMPT.version, model: deps.models.check, runs: m.runs, cost: m.cost });
      return { status: r.replayed ? 200 : 201, body: { kind: "card", askId: r.id, card: await viewOf(deps.store, cachedOk.id, cachedOk.card, null), replayed: r.replayed } };
    }
    supersedes = cachedOk.id; // -1: none of the meanings fits → a new version with that meaning first
  }

  const reasons: string[] = [];
  const draft = async (rewriteFor?: string[]) =>
    cardToolOutputSchema.safeParse(
      await m.call(buildCardCall({ template: deps.prompts.card, model: deps.models.card, word: headword, context, language, band, rewriteFor, keepSenses: supersedes ? cachedOk?.card.senses : undefined, toolChoice: tc }), CARD_PROMPT.version, "vocab_card"),
    );
  const check = async (card: CardContent): Promise<string[]> => {
    const code = cardCodeReasons(card, { headword, language, context });
    if (code.length) return code;
    const out = checkOut.safeParse(await m.call(buildCardCheckCall({ template: deps.prompts.check, model: deps.models.check, word: headword, card, language, band, context, toolChoice: tc }), CARD_CHECK_PROMPT.version, "vocab_check"));
    if (!out.success) return ["check_failed"];
    return out.data.pass ? [] : out.data.reasons.length ? out.data.reasons.map((r) => `haiku_${r}`) : ["haiku_fail"];
  };

  let card: CardContent | null = null;
  let guard: "pass" | "rewritten" = "pass";
  const first = await draft();
  if (!first.success) reasons.push("unreadable");
  else if (first.data.status === "not_word") {
    await m.flush(gate.reservationId ?? null, purpose);
    const suggestions = first.data.suggestions.map((x) => x.trim().toLowerCase()).filter((x) => SUGGESTION.test(x) && !isBlocked(x)).slice(0, 3);
    const r = await record({ cardId: null, sense: null, shown: suggestions.length ? suggestions.join(", ") : null, guard: "fixed", reasons: [], fixedCode: "not_word", usedAi: true, promptVersion: CARD_PROMPT.version, model: deps.models.card, runs: m.runs, cost: m.cost });
    return { status: r.replayed ? 200 : 201, body: { kind: "not_word", askId: r.id, suggestions, replayed: r.replayed } };
  } else {
    const r1 = await check(first.data.card);
    if (r1.length === 0) card = first.data.card;
    else reasons.push(...r1);
  }
  if (!card && reasons.length) {
    const second = await draft(reasons);
    if (second.success && second.data.status === "ok") {
      const r2 = await check(second.data.card);
      if (r2.length === 0) {
        card = second.data.card;
        guard = "rewritten";
      } else reasons.push(...r2.map((x) => `rewrite_${x}`));
    } else reasons.push("rewrite_failed");
  }
  await m.flush(gate.reservationId ?? null, purpose);
  if (!card) return fixed(m.used ? "card_failed" : "ai_error", { usedAi: m.used, runs: m.runs, cost: m.cost });
  // A sentence that points to another word ("left" the adjective vs "leave") makes a card of its own: replace only the same word.
  const replaces = supersedes && cachedOk && cachedOk.card.headword.trim().toLowerCase() === card.headword.trim().toLowerCase() ? supersedes : null;
  card = { ...card, headword: card.headword.trim().toLowerCase() };
  let cardId: string;
  try {
    cardId = await deps.store.saveCard({ band, language, content: card, promptVersion: CARD_PROMPT.version, model: deps.models.card, supersedes: replaces });
  } catch {
    // The money is spent and booked: record the ask (it counts against the AI limit) and say so; never a 500.
    return fixed("card_failed", { usedAi: true, runs: m.runs, cost: m.cost });
  }
  const r = await record({ cardId, sense: context ? 0 : null, shown: null, guard, reasons, fixedCode: null, usedAi: true, promptVersion: CARD_PROMPT.version, model: deps.models.card, runs: m.runs, cost: m.cost });
  return { status: r.replayed ? 200 : 201, body: { kind: "card", askId: r.id, card: await viewOf(deps.store, cardId, card, context ? 0 : null), replayed: r.replayed } };
}

async function replayed(deps: LookupDeps, r: z.infer<typeof replaySchema>["replay"]): Promise<LookupResult> {
  if (r.kind === "again" && r.shown_text) {
    const again = againOut.safeParse(JSON.parse(r.shown_text));
    if (again.success) return { status: 200, body: { kind: "again", askId: r.id, again: again.data, replayed: true } };
  }
  if (r.card_id) {
    const row = await deps.store.cardById(r.card_id);
    const card = row ? cardContentSchema.safeParse(row.content) : null;
    if (row && card?.success) return { status: 200, body: { kind: "card", askId: r.id, card: await viewOf(deps.store, row.id, card.data, r.sense), replayed: true } };
  }
  if (r.fixed_code === "not_word") return { status: 200, body: { kind: "not_word", askId: r.id, suggestions: r.shown_text ? r.shown_text.split(", ") : [], replayed: true } };
  return { status: 200, body: { kind: "fixed", askId: r.id, fixed: (r.fixed_code as LookupFixed | null) ?? "ai_error", replayed: true } };
}

/** "Chưa hiểu, giải thích cách khác" on one of the child's own lookups: one AI turn, checked like a card. */
export async function runAgain(deps: LookupDeps, input: { userId: string; askId: string; clientId: string }): Promise<LookupResult> {
  let raw: unknown;
  try {
    raw = await deps.store.context({ userId: input.userId, clientId: input.clientId, askId: input.askId });
  } catch (err) {
    const mapped = dbTag(err);
    if (mapped) return mapped;
    throw err;
  }
  const replay = replaySchema.safeParse(raw);
  if (replay.success) return replayed(deps, replay.data.replay);
  const ctx = ctxSchema.parse(raw);
  if (!ctx.ask) return { status: 404, body: { error: "not_found" } };
  const row = await deps.store.cardById(ctx.ask.card_id);
  const parsed = row ? cardContentSchema.safeParse(row.content) : null;
  if (!row || !parsed?.success) return { status: 404, body: { error: "not_found" } };
  const card = parsed.data;
  const language = ctx.language ?? "vi";
  const band = ctx.band ?? "";
  const base = { userId: input.userId, kind: "again" as const, childText: card.headword.slice(0, 40), contextText: null, cardId: row.id, sense: null, parentAsk: ctx.ask.id, clientId: input.clientId, flags: [] as string[] };
  const fixed = async (code: LookupFixed, spent: { usedAi: boolean; runs: string[]; cost: number } = { usedAi: false, runs: [], cost: 0 }): Promise<LookupResult> => {
    const r = await deps.store.record({ ...base, shown: null, guard: "fixed", reasons: [], fixedCode: code, usedAi: spent.usedAi, promptVersion: spent.usedAi ? AGAIN_PROMPT.version : null, model: spent.usedAi ? deps.models.card : null, runs: spent.runs, cost: spent.cost });
    return { status: r.replayed ? 200 : 201, body: { kind: "fixed", askId: r.id, fixed: code, replayed: r.replayed } };
  };
  if (ctx.lookups_today >= ctx.lookup_limit) return fixed("daily_limit");
  if (ctx.consent_version !== deps.noticeVersion) return fixed("ai_off");
  if (ctx.ai_lookups_today >= ctx.ai_lookup_limit) return fixed("ai_daily_limit");
  if (!isPricedModel(deps.models.card) || !isPricedModel(deps.models.check)) return fixed("ai_error");
  const gate = parseGate(await deps.store.gate({ learnerId: ctx.learner_id, estimate: LOOKUP_RESERVE_USD, model: deps.models.card, purpose: "vocab_again" }));
  if (!gate.allowed) return fixed("ai_off");
  const m = meter(deps, ctx.family_id);
  const tc = deps.models.toolChoice;
  const reasons: string[] = [];
  const codeReasons = (a: AgainView): string[] => {
    const all = [a.core, a.task, ...a.examples.flatMap((e) => [e.en, e.vi])];
    const r: string[] = [];
    if (all.some((s) => /https?:|www\./i.test(s))) r.push("has_url");
    if (all.some((s) => IPA_LIKE.test(s))) r.push("has_ipa");
    if (linesOf(a.core) > 2) r.push("too_many_lines");
    return r;
  };
  let shown: AgainView | null = null;
  let guard: "pass" | "rewritten" = "pass";
  for (let attempt = 0; attempt < 2 && !shown; attempt++) {
    const out = againOut.safeParse(await m.call(buildAgainCall({ template: deps.prompts.again, model: deps.models.card, card, language, band, rewriteFor: attempt ? reasons : undefined, toolChoice: tc }), AGAIN_PROMPT.version, "vocab_again"));
    if (!out.success) {
      reasons.push(attempt ? "rewrite_unreadable" : "unreadable");
      continue;
    }
    let r = codeReasons(out.data);
    if (!r.length) {
      const ck = checkOut.safeParse(await m.call(buildCardCheckCall({ template: deps.prompts.check, model: deps.models.check, word: card.headword, card: out.data, language, band, toolChoice: tc }), CARD_CHECK_PROMPT.version, "vocab_check"));
      r = !ck.success ? ["check_failed"] : ck.data.pass ? [] : ck.data.reasons.length ? ck.data.reasons.map((x) => `haiku_${x}`) : ["haiku_fail"];
    }
    if (r.length === 0) {
      shown = out.data;
      guard = attempt ? "rewritten" : "pass";
    } else reasons.push(...(attempt ? r.map((x) => `rewrite_${x}`) : r));
  }
  await m.flush(gate.reservationId ?? null, "vocab_again");
  if (!shown) return fixed(m.used ? "card_failed" : "ai_error", { usedAi: m.used, runs: m.runs, cost: m.cost });
  const r = await deps.store.record({ ...base, shown: JSON.stringify(shown), guard, reasons, fixedCode: null, usedAi: true, promptVersion: AGAIN_PROMPT.version, model: deps.models.card, runs: m.runs, cost: m.cost });
  return { status: r.replayed ? 200 : 201, body: { kind: "again", askId: r.id, again: shown, replayed: r.replayed } };
}
