/** Form rules shared by the screens and the routes (the database checks the same rules again). Pure. */
import { hasScoreWords } from "./scoreWords";
import { cleanText } from "./text";
import { EXCERPT_MAX, ITEM_MAX, MAX_ITEMS, PRAISE_MAX, REASON_MAX, type FeedbackDraftItem, type MarkChoice, type MarkDraft, type Verdict } from "./types";

export type FeedbackProblem = "praise_required" | "items_required" | "item_too_long" | "excerpt_too_long" | "excerpt_not_found" | "score_words";

export function checkFeedback(praise: string, items: FeedbackDraftItem[], text: string | null): FeedbackProblem | null {
  const p = praise.trim();
  if (p.length < 1 || p.length > PRAISE_MAX) return "praise_required";
  if (items.length < 1 || items.length > MAX_ITEMS || items.some((i) => i.text.trim() === "")) return "items_required";
  if (items.some((i) => i.text.trim().length > ITEM_MAX)) return "item_too_long";
  if (hasScoreWords(p) || items.some((i) => hasScoreWords(i.text))) return "score_words";
  for (const i of items) {
    const ex = i.excerpt.trim();
    if (ex.length > EXCERPT_MAX) return "excerpt_too_long";
    if (ex && text !== null && !cleanText(text).includes(cleanText(ex))) return "excerpt_not_found";
  }
  return null;
}

export type MarksProblem = "marks_incomplete" | "reason_required" | "unchanged_needs_reason" | "reason_too_long";

export function checkMarks(items: { n: number }[], marks: Record<string, MarkDraft>, reasonRequired: boolean, unchanged: boolean): MarksProblem | null {
  for (const it of items) {
    const m = marks[String(it.n)];
    if (!m?.choice) return "marks_incomplete";
    const reason = (m.reason ?? "").trim();
    if (reason.length > REASON_MAX) return "reason_too_long";
    if (reasonRequired && !reason) return "reason_required";
    if (unchanged && (m.choice !== "kept" || !reason)) return "unchanged_needs_reason";
  }
  return null;
}

/** The marks of this round's items, ready to send: {"1": {choice, reason?}}; empty reasons are left out. */
export function marksToSend(items: { n: number }[], marks: Record<string, MarkDraft>): Record<string, { choice: MarkChoice; reason?: string }> {
  const out: Record<string, { choice: MarkChoice; reason?: string }> = {};
  for (const it of items) {
    const m = marks[String(it.n)];
    if (!m?.choice) continue;
    const reason = (m.reason ?? "").trim();
    out[String(it.n)] = reason ? { choice: m.choice, reason } : { choice: m.choice };
  }
  return out;
}

export function missingVerdicts(items: { n: number }[], verdicts: Record<number, Verdict | undefined>): number {
  return items.filter((it) => !verdicts[it.n]).length;
}
