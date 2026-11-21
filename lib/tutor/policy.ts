/**
 * E1 · what the server decides before and after the model (DOMAIN bản 0.9, BO_TEST G1–G9). Pure.
 *   - before: daily limit (P-E1-5), missing part data (G8), no answer to guard (open question), all three levels used → a fixed
 *     sentence, no model call;
 *   - after: the safe sentence when a hint is refused twice; form metrics (G9 length, language) for the test set.
 */
import { leadOf } from "@/lib/studio/taskParts";
import { leakReasons } from "./leak";
import type { TutorContext } from "./prompt";
import { languageRule } from "./prompt";

export const MAX_LEVEL = 3;
export type FixedCode = "daily_limit" | "missing_part" | "no_answer" | "max_level" | "ai_off" | "ai_error";
export type TurnPlan = { call: true; kind: "hint" | "question"; level: number } | { call: false; fixed: FixedCode };

export function planTurn(ctx: TutorContext, childText: string | null): TurnPlan {
  if (ctx.turnsToday >= ctx.dailyLimit) return { call: false, fixed: "daily_limit" };
  if (!ctx.part) return { call: false, fixed: "missing_part" };
  // No answer to check against (an open question: its model answer stays sealed; or a key that is missing): no AI, the guards could not
  // tell a hint from a written answer.
  if (ctx.answers.length === 0) return { call: false, fixed: "no_answer" };
  const kind = childText ? "question" : "hint";
  if (kind === "hint" && ctx.hintsUsed >= MAX_LEVEL) return { call: false, fixed: "max_level" };
  const level = kind === "hint" ? ctx.hintsUsed + 1 : Math.max(1, Math.min(MAX_LEVEL, ctx.hintsUsed));
  return { call: true, kind, level };
}

/**
 * The safe sentence (no model): the part's own instruction (without its word bank, which may hold the answer) and a small step.
 * Checked against the answer like any hint; if even that leaks, the plain fallback.
 */
export function safeHint(ctx: TutorContext, texts: { safe: (instruction: string, choice: boolean) => string; plain: string }): string {
  const lead = ctx.part ? leadOf({ ...ctx.part, items: [] }) : null;
  const instruction = (lead?.text || lead?.title || "").slice(0, 300);
  const out = instruction ? texts.safe(instruction, ctx.item.kind === "mcq" || ctx.item.options.length > 0) : texts.plain;
  return leakReasons(out, { kind: ctx.item.kind, stem: ctx.item.stem, options: ctx.item.options, answers: ctx.answers }).length ? texts.plain : out;
}

const VI = /[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/i;
const lines = (s: string) => s.split(/\n+|(?<=[.!?])\s+(?=\p{Lu})/u).map((l) => l.trim()).filter(Boolean);

/** G9 + language, measured (the test set; logged, not used to block a hint). */
export function formOf(text: string, language: string): { lines: number; lengthOk: boolean; endsWithAsk: boolean; languageOk: boolean } {
  const ls = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const sentences = lines(text);
  const last = sentences[sentences.length - 1] ?? "";
  const endsWithAsk = /\?\s*$/.test(last) || /^(bạn |hãy |thử |try |look |find |read |think |check |underline |circle |say |count |write |cross |choose |tell |now |then |tìm |đọc |gạch |đếm |nói |viết )/i.test(last);
  const viLines = ls.filter((l) => VI.test(l)).length;
  const languageOk = language === "en_first" ? !VI.test(ls[0] ?? "") && viLines <= 1 : VI.test(text);
  return { lines: ls.length, lengthOk: ls.length <= languageRule(language).maxLines && text.length <= 700, endsWithAsk, languageOk };
}

/** Child text that tries to change the rules (A.10, N.10): flagged even if the model misses it. */
export const looksLikeInjection = (t: string | null) =>
  !!t && /\b(system|ignore (all|previous)|reveal|you may now|developer mode)\b|cho phép.*(đưa|nói|cho).*đáp án|được phép.*đáp án/i.test(t);
