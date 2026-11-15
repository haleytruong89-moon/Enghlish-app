/**
 * W4c2 · pure rules of the question-by-question player. No React, no fetch: the component only draws what these functions say.
 * Counts are about the child's OWN work (questions answered), never about right answers (PRD D35).
 */
import type { ItemView } from "@/lib/work/types";

export type Answers = Record<string, string>;

export const isAnswered = (answers: Answers, id: string): boolean => (answers[id] ?? "").trim() !== "";

/** Ids of the step's questions that have an answer. Answers of ids that are not in the step are ignored. */
export function answeredIds(items: readonly Pick<ItemView, "id">[], answers: Answers): string[] {
  return items.filter((it) => isAnswered(answers, it.id)).map((it) => it.id);
}

export function progress(items: readonly Pick<ItemView, "id">[], answers: Answers): { answered: number; total: number } {
  return { answered: answeredIds(items, answers).length, total: items.length };
}

export const clampIndex = (i: number, total: number): number => (total <= 0 ? 0 : Math.min(Math.max(Math.trunc(i) || 0, 0), total - 1));
export const nextIndex = (i: number, total: number): number => clampIndex(i + 1, total);
export const prevIndex = (i: number, total: number): number => clampIndex(i - 1, total);
export const isLast = (i: number, total: number): boolean => total > 0 && i >= total - 1;

/** Where to open: the first question without an answer (so "Làm tiếp" lands on the right one); all answered → the last. */
export function startIndex(items: readonly Pick<ItemView, "id">[], answers: Answers): number {
  const i = items.findIndex((it) => !isAnswered(answers, it.id));
  return i === -1 ? clampIndex(items.length - 1, items.length) : i;
}

export type DotState = "answered" | "empty";
export type Dot = { id: string; state: DotState; current: boolean };
export function dots(items: readonly Pick<ItemView, "id">[], answers: Answers, current: number): Dot[] {
  return items.map((it, i) => ({ id: it.id, state: isAnswered(answers, it.id) ? "answered" : "empty", current: i === current }));
}

/** Positions (0-based) of the unanswered questions: shown before submit as "Bạn chưa trả lời câu 3, 5". */
export function unansweredIndexes(items: readonly Pick<ItemView, "id">[], answers: Answers): number[] {
  return items.flatMap((it, i) => (isAnswered(answers, it.id) ? [] : [i]));
}

// --- autosave that merges: many edits while a save is running become ONE more save afterwards ---------------------------------------
export type SaveFlow = { dirty: boolean; inflight: boolean; failed: boolean; everSaved: boolean };
export const initialSaveFlow = (saved: boolean): SaveFlow => ({ dirty: false, inflight: false, failed: false, everSaved: saved });
export const onEdit = (s: SaveFlow): SaveFlow => ({ ...s, dirty: true });
/** A save may start only when something changed and none is running (edits during a save wait for it: merged). */
export const shouldSave = (s: SaveFlow): boolean => s.dirty && !s.inflight;
export const onSaveStart = (s: SaveFlow): SaveFlow => ({ ...s, dirty: false, inflight: true });
export const onSaveDone = (s: SaveFlow, ok: boolean): SaveFlow => ({ ...s, inflight: false, failed: !ok, dirty: s.dirty || !ok, everSaved: s.everSaved || ok });
export type SaveLabel = "saving" | "error" | "saved" | "none";
export function saveLabel(s: SaveFlow): SaveLabel {
  if (s.inflight) return "saving";
  if (s.failed) return "error";
  return s.everSaved ? "saved" : "none";
}
