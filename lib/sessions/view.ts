/** Small pure helpers that turn curriculum cards and day facts into the words the sessions page shows. */
import { absenceCopy, sessionStatsCopy } from "@/lib/copy/vi";
import { dayMonth, effectiveKinds, liveAbsences } from "./count";
import type { AbsenceRow, DayUnit, MarkRow, NoteRow, SessionDay } from "./types";

type CardLike = { id: string; title: string; current: { units: { code: string; title: string }[] } | null; progress: { current: { code: string; title: string } | null } | null };

/** Title of a Unit in an approved curriculum (null when unknown). */
export function unitTitleOf(cards: readonly CardLike[]): (curriculumId: string, code: string) => string | null {
  const m = new Map<string, string>();
  for (const c of cards) for (const u of c.current?.units ?? []) m.set(`${c.id}/${u.code}`, u.title);
  return (curriculumId, code) => m.get(`${curriculumId}/${code}`) ?? null;
}

/** "U13 Unreal time" (or just "U13"). */
export const unitText = (u: { code: string; title: string | null }): string => (u.title ? `${u.code} ${u.title}` : u.code);
export const unitsText = (units: readonly DayUnit[]): string => units.map(unitText).join(", ");

/** "Đang học đến": at most 2 curricula ("Destination: U13 Unreal time"), then "+k". Empty list = nothing started. */
export function currentUnitLines(cards: readonly CardLike[]): { lines: string[]; more: number } {
  const all = cards.filter((c) => c.progress?.current).map((c) => `${c.title}: ${unitText(c.progress!.current!)}`);
  return { lines: all.slice(0, 2), more: Math.max(0, all.length - 2) };
}

/** "Thứ Tư" (the weekday of an ISO date). */
export function weekdayLong(iso: string): string {
  const i = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
  return sessionStatsCopy.weekdaysLong[i]!;
}
/** "Thứ Tư 12/11/2026". */
export function longDay(iso: string): string {
  return `${weekdayLong(iso)} ${dayMonth(iso)}/${iso.slice(0, 4)}`;
}

/** "1,5" (Vietnamese decimal comma) or the dash. */
export const perWeekText = (v: number | null): string => (v === null ? sessionStatsCopy.perWeekNone : String(v).replace(".", ","));

export const lastText = (last: string | null): string => (last ? dayMonth(last) : "");
export type { SessionDay };

/** "2026-11" → itself when it is a real month that is at most 2 months after today's month (the +60-day window of absences); otherwise null (404). */
export function parseMonth(v: string, todayIso: string): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return null;
  const idx = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
  return idx(v) <= idx(todayIso.slice(0, 7)) + 2 ? v : null;
}

/** "19/11 · con, không tính phí" (the words that name an absence in a list). */
export function absenceLine(a: Pick<AbsenceRow, "absentOn" | "requestedBy" | "billable">): string {
  return `${dayMonth(a.absentOn)} · ${absenceCopy.who[a.requestedBy]}, ${a.billable ? absenceCopy.billableYes.toLowerCase() : absenceCopy.billableNo.toLowerCase()}`;
}

/**
 * Live absences that no COUNTED current "Học bù" note points to yet (a tutor-written note whose newest mark is Học bù): the choices of
 * "Bù cho buổi nghỉ ngày …". A parent-only makeup mark does not use up an absence (same rule as eng_absence_made_up in 0030). When
 * `forNoteId` is given (editing a note that is already a makeup), the absence that note points to stays in the list.
 */
export function makeupChoices(notes: NoteRow[], marks: MarkRow[], absences: AbsenceRow[], forNoteId?: string): { id: string; label: string }[] {
  const kinds = effectiveKinds(notes, marks);
  const used = new Set<string>();
  for (const n of notes) {
    const m = kinds.get(n.id);
    if (m?.kind === "makeup" && m.makeupFor && n.authorRole === "tutor" && n.id !== forNoteId) used.add(m.makeupFor);
  }
  return liveAbsences(absences).filter((a) => !used.has(a.id)).map((a) => ({ id: a.id, label: absenceLine(a) }));
}
