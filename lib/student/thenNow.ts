/**
 * W4e · "Ngày ấy – bây giờ" (plan §3.8, Q16): two pieces of the child's OWN writing on the app that the child's tutor picked, with one short note.
 * Pure helpers shared by the child's card and the adult picker.
 */
import { dayVn, type IsoDate } from "./week";

export const NOTE_MAX = 200;

export type ThenNowPiece = { on: IsoDate; text: string };
export type ThenNowView = { then: ThenNowPiece; now: ThenNowPiece; note: string | null };

/** What the tutor may type as the note: trimmed, 1..200 characters, or null when empty. Over-long text is refused (the child's words are not cut). */
export function normalizeNote(raw: string): { ok: true; note: string | null } | { ok: false } {
  const t = raw.trim();
  if (t.length === 0) return { ok: true, note: null };
  if ([...t].length > NOTE_MAX) return { ok: false };
  return { ok: true, note: t };
}

/** The pair is ordered when the "then" day is strictly before the "now" day (Vietnam days; the database decides the same way). */
export const isOrderedPair = (thenAt: string, nowAt: string): boolean => dayVn(thenAt) < dayVn(nowAt);

/** The first words of a text for a picker line (never cuts a word in the middle when it can avoid it). */
export function preview(text: string, max = 80): string {
  const t = text.replace(/\s+/g, " ").trim();
  if ([...t].length <= max) return t;
  const cut = [...t].slice(0, max).join("");
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}
