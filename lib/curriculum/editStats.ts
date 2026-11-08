/**
 * How much of the AI draft the tutor kept (spec §1 goal 5, §8 "Thử AI bằng dùng thật"): counted by CODE, never by the AI. Rows are
 * matched through ai_index, so a corrected unit code still counts as an edit, not as drop + add. Pure.
 */
import type { CurriculumPayload, UnitDraft } from "./schema";
import { EDIT_REASONS, EDIT_WARN_PCT, type EditReason } from "./types";

export type EditStats = {
  ai_rows: number;
  kept: number;
  edited: number;
  dropped: number;
  added: number;
  /** (edited + dropped) ÷ AI rows, whole percent. */
  edited_pct: number;
  reasons: Partial<Record<EditReason, number>>;
};

const sameRow = (a: UnitDraft, b: UnitDraft) =>
  a.code === b.code && a.title === b.title && a.section === b.section && a.page === b.page && a.skipped === b.skipped &&
  [...a.points].sort().join("|") === [...b.points].sort().join("|");

export function editStats(ai: CurriculumPayload | null, final: CurriculumPayload): EditStats | null {
  if (!ai) return null;
  const byIndex = new Map(final.units.filter((u) => u.ai_index !== null).map((u) => [u.ai_index as number, u]));
  let kept = 0;
  let edited = 0;
  let dropped = 0;
  ai.units.forEach((a, i) => {
    const f = byIndex.get(i);
    if (!f || f.dropped) dropped += 1;
    else if (sameRow(a, f)) kept += 1;
    else edited += 1;
  });
  const added = final.units.filter((u) => u.ai_index === null && !u.dropped).length;
  const reasons: Partial<Record<EditReason, number>> = {};
  for (const u of final.units) {
    if (u.edit_reason && (EDIT_REASONS as readonly string[]).includes(u.edit_reason)) reasons[u.edit_reason] = (reasons[u.edit_reason] ?? 0) + 1;
  }
  const n = ai.units.length;
  return { ai_rows: n, kept, edited, dropped, added, edited_pct: n > 0 ? Math.round(((edited + dropped) * 100) / n) : 0, reasons };
}

/** Spec §8: more than 20 % of the AI rows edited → stop and fix the prompt before going on. */
export const tooManyEdits = (s: EditStats | null): boolean => s !== null && s.edited_pct > EDIT_WARN_PCT;
