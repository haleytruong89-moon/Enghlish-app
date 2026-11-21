/**
 * E1 · one turn of "Hỏi" / "Gợi ý tiếp" / a question the child typed. Pure orchestration with injected store and model caller:
 *   context (the DB checks owner, test flag L2, not sent yet, replay) → fixed answers without a model (limit, G8, H3 used) → cost gate
 *   (reserve) → Sonnet → code check L1/G1–G3 → Haiku check L6/G4 → at most one rewrite → else the safe sentence → ledger + turn.
 * The child only ever gets text that passed the checks, the safe sentence or a fixed sentence. Errors never become a 500 for the child.
 */
import { parseGate } from "@/lib/ai/cap";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { AiCallError, type ToolCall, type ToolResult } from "@/lib/ai/request";
import { ReviewDbError } from "@/lib/review/handlers";
import { leakReasons } from "./leak";
import { looksLikeInjection, planTurn, safeHint, type FixedCode } from "./policy";
import { buildCheckCall, buildHintCall, CHECK_PROMPT, HINT_PROMPT, TUTOR_FLAGS, type TutorContext, type TutorFlag } from "./prompt";
import { z } from "zod";

/** Worst case of one turn (two Sonnet calls with room to think + two Haiku checks), reserved before the first call. */
export const TURN_RESERVE_USD = 0.1;

export type TutorStore = {
  context(a: { userId: string; activityId: string; itemId: string; clientId: string }): Promise<unknown>;
  gate(a: { learnerId: string; estimate: number; model: string }): Promise<unknown>;
  logRun(a: { familyId: string; model: string; promptVersion: string; input: number; output: number; cost: number; status: "ok" | "error"; error: string | null; release: string | null; purpose: "tutor_hint" | "tutor_check" }): Promise<string>;
  record(a: {
    userId: string; activityId: string; itemId: string; kind: "hint" | "question" | "fixed"; childText: string | null; shown: string;
    guard: "pass" | "rewritten" | "safe" | "fixed"; reasons: string[]; flags: string[]; fixedCode: FixedCode | null; promptVersion: string | null;
    model: string | null; runs: string[]; cost: number; clientId: string;
  }): Promise<unknown>;
};
export type TutorCopy = { fixed: Record<FixedCode, string>; safe: Record<string, (instruction: string) => string>; plain: Record<string, string> };
export type TutorDeps = {
  store: TutorStore;
  /** The consent text version the tutor needs (lib/ai/config TUTOR_NOTICE_VERSION). */
  noticeVersion: string;
  call: (c: ToolCall) => Promise<ToolResult>;
  prompts: { hint: string; check: string };
  models: { hint: string; check: string; toolChoice?: "tool" | "auto" };
  copy: TutorCopy;
};
export type TurnInput = { userId: string; activityId: string; itemId: string; clientId: string; childText: string | null };
export type TurnBody = { text: string; kind: "hint" | "question" | "fixed"; level: number; fixed: FixedCode | null; replayed: boolean };
export type TurnResult = { status: 200 | 201 | 400 | 403 | 404 | 409; body: TurnBody | { error: string } };

const num = z.union([z.number(), z.string()]).transform(Number);
const ctxSchema = z.object({
  learner_id: z.string(), family_id: z.string(),
  item: z.object({ id: z.string(), kind: z.string(), stem: z.string(), options: z.array(z.string()) }),
  part: z.object({ key: z.string(), name: z.string(), instructions: z.string() }).nullable(),
  answers: z.array(z.string()), consent_version: z.string().nullable().optional(), hints_used: num, turns_today: num, daily_limit: num,
  language: z.string().nullable(), band: z.string().nullable(),
  previous: z.array(z.object({ kind: z.string(), level: num, child_text: z.string().nullable(), shown_text: z.string() })),
});
const replaySchema = z.object({ replay: z.object({ kind: z.enum(["hint", "question", "fixed"]), level: num, shown_text: z.string(), fixed_code: z.string().nullable() }) });
const hintOut = z.object({ hint: z.string(), flags: z.array(z.string()).default([]) });
const checkOut = z.object({ pass: z.boolean(), reasons: z.array(z.string()).default([]) });

export function toContext(raw: unknown): TutorContext {
  const c = ctxSchema.parse(raw);
  return {
    learnerId: c.learner_id, familyId: c.family_id, item: c.item, part: c.part, answers: c.answers, consentVersion: c.consent_version ?? null, hintsUsed: c.hints_used,
    turnsToday: c.turns_today, dailyLimit: c.daily_limit, language: c.language ?? "vi", band: c.band ?? "", previous: c.previous,
  };
}

/** The "(tag)" at the end of a database message → what the child's screen can explain. */
function contextError(err: unknown): TurnResult | null {
  if (!(err instanceof ReviewDbError)) return null;
  const tag = /\(([a-z_]+)\)\s*$/.exec(err.detail)?.[1];
  if (tag === "test_work") return { status: 403, body: { error: "test_work" } };
  if (tag === "sent") return { status: 409, body: { error: "sent" } };
  if (tag === "not_found" || tag === "not_studio") return { status: 404, body: { error: "not_found" } };
  if (err.code === "PGRST202" || err.code === "42883") return { status: 409, body: { error: "tutor_unavailable" } };
  return null;
}

export async function runTutorTurn(deps: TutorDeps, input: TurnInput): Promise<TurnResult> {
  let raw: unknown;
  try {
    raw = await deps.store.context(input);
  } catch (err) {
    const mapped = contextError(err);
    if (mapped) return mapped;
    throw err;
  }
  const replay = replaySchema.safeParse(raw);
  if (replay.success) {
    const r = replay.data.replay;
    return { status: 200, body: { text: r.shown_text, kind: r.kind, level: r.level, fixed: (r.fixed_code as FixedCode | null) ?? null, replayed: true } };
  }
  const ctx = toContext(raw);
  const childText = input.childText?.trim() ? input.childText.trim().slice(0, 200) : null;
  const flags = new Set<string>(looksLikeInjection(childText) ? ["injection_attempt"] : []);

  const fixed = async (code: FixedCode, spent: { runs: string[]; cost: number; model: string | null } = { runs: [], cost: 0, model: null }): Promise<TurnResult> => {
    const text = deps.copy.fixed[code];
    const rec = (await deps.store.record({
      ...input, kind: "fixed", childText, shown: text, guard: "fixed", reasons: [], flags: [...flags], fixedCode: code,
      promptVersion: spent.model ? HINT_PROMPT.version : null, model: spent.model, runs: spent.runs, cost: spent.cost,
    })) as { level?: number; replayed?: boolean };
    return { status: rec?.replayed ? 200 : 201, body: { text, kind: "fixed", level: Number(rec?.level ?? 0), fixed: code, replayed: !!rec?.replayed } };
  };

  const plan = planTurn(ctx, childText);
  if (!plan.call) return fixed(plan.fixed);

  // The parent agreed to the text that mentions the tutor (the child's typed question goes to the AI): otherwise "Gia sư đang nghỉ".
  if (ctx.consentVersion !== deps.noticeVersion) return fixed("ai_off");
  // Cost gate of the family (switch, ai_text consent of this child, monthly cap) with a reservation of the worst case.
  const gate = parseGate(await deps.store.gate({ learnerId: ctx.learnerId, estimate: TURN_RESERVE_USD, model: deps.models.hint }));
  if (!gate.allowed) return fixed("ai_off");
  let release: string | null = gate.reservationId ?? null;
  const runs: string[] = [];
  let cost = 0;
  const log = async (model: string, promptVersion: string, purpose: "tutor_hint" | "tutor_check", usage: { inputTokens: number; outputTokens: number }, error: string | null) => {
    const c = estimateCostUsd(model, usage.inputTokens, usage.outputTokens);
    cost += c;
    runs.push(await deps.store.logRun({ familyId: ctx.familyId, model, promptVersion, input: usage.inputTokens, output: usage.outputTokens, cost: c, status: error ? "error" : "ok", error, release, purpose }));
    release = null;
  };

  const draft = async (rewriteFor?: string[]): Promise<string | null> => {
    try {
      const res = await deps.call(buildHintCall({ template: deps.prompts.hint, model: deps.models.hint, ctx, level: plan.level, childText, rewriteFor, toolChoice: deps.models.toolChoice }));
      await log(deps.models.hint, HINT_PROMPT.version, "tutor_hint", res.usage, null);
      const out = hintOut.safeParse(res.input);
      if (!out.success || !out.data.hint.trim()) return null;
      for (const f of out.data.flags) if ((TUTOR_FLAGS as readonly string[]).includes(f)) flags.add(f as TutorFlag);
      return out.data.hint.trim().slice(0, 1400);
    } catch (err) {
      await log(deps.models.hint, HINT_PROMPT.version, "tutor_hint", err instanceof AiCallError ? err.usage : { inputTokens: 0, outputTokens: 0 }, err instanceof AiCallError ? err.code : "error");
      return null;
    }
  };
  /** null = refused (with reasons) by code or Haiku; the Haiku call failing counts as a refusal (never show an unchecked hint). */
  const check = async (text: string): Promise<string[]> => {
    const code = leakReasons(text, { kind: ctx.item.kind, stem: ctx.item.stem, options: ctx.item.options, answers: ctx.answers });
    if (code.length) return code;
    try {
      const res = await deps.call(buildCheckCall({ template: deps.prompts.check, model: deps.models.check, ctx, hint: text, childText, toolChoice: deps.models.toolChoice }));
      await log(deps.models.check, CHECK_PROMPT.version, "tutor_check", res.usage, null);
      const out = checkOut.safeParse(res.input);
      if (!out.success) return ["check_unreadable"];
      return out.data.pass ? [] : out.data.reasons.length ? out.data.reasons.map((r) => `haiku_${r}`) : ["haiku_fail"];
    } catch (err) {
      await log(deps.models.check, CHECK_PROMPT.version, "tutor_check", err instanceof AiCallError ? err.usage : { inputTokens: 0, outputTokens: 0 }, err instanceof AiCallError ? err.code : "error");
      return ["check_failed"];
    }
  };

  let shown: string | null = null;
  let guard: "pass" | "rewritten" | "safe" = "pass";
  const reasons: string[] = [];
  const first = await draft();
  // The model failed outright (API error, no text): a fixed sentence, no level used; the call stays in the ledger.
  if (first === null) return fixed("ai_error", { runs, cost, model: deps.models.hint });
  const r1 = await check(first);
  if (r1.length === 0) shown = first;
  else {
    reasons.push(...r1);
    const second = await draft(r1);
    if (second !== null) {
      const r2 = await check(second);
      if (r2.length === 0) {
        shown = second;
        guard = "rewritten";
      } else reasons.push(...r2.map((x) => `rewrite_${x}`));
    } else reasons.push("rewrite_failed");
  }
  if (shown === null) {
    shown = safeHint(ctx, { safe: deps.copy.safe[ctx.language] ?? deps.copy.safe.vi!, plain: deps.copy.plain[ctx.language] ?? deps.copy.plain.vi! });
    guard = "safe";
  }
  const rec = (await deps.store.record({
    ...input, kind: plan.kind, childText, shown, guard, reasons, flags: [...flags], fixedCode: null, promptVersion: HINT_PROMPT.version, model: deps.models.hint, runs, cost,
    clientId: input.clientId,
  })) as { level?: number; replayed?: boolean };
  return { status: rec?.replayed ? 200 : 201, body: { text: shown, kind: plan.kind, level: Number(rec?.level ?? plan.level), fixed: null, replayed: !!rec?.replayed } };
}
