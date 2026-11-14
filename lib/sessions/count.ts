/**
 * Counting lesson sessions (pure, DOMAIN §5.6). One session = one calendar day (Asia/Ho_Chi_Minh, the note's session_date) with at least
 * one CURRENT lesson note (not replaced by a later version), whoever wrote it and whether or not it is shared. Two notes the same day =
 * one session, flagged. No money here (U11).
 */
import { sessionMonthCopy } from "@/lib/copy/vi";
import { addDays } from "@/lib/inquiries/dates";
import type { DayUnit, MonthSummary, NoteRow, SessionDay, SessionStats, TaughtRow, WeekRow } from "./types";

/** Notes that no other note replaces. A broken supersedes loop only drops its members (never loops forever). */
export function currentNotes(rows: NoteRow[]): NoteRow[] {
  const replaced = new Set(rows.map((r) => r.supersedesId).filter((x): x is string => x !== null));
  return rows.filter((r) => !replaced.has(r.id));
}

export function sessionDays(rows: NoteRow[], taught: TaughtRow[], titleOf: (curriculumId: string, code: string) => string | null): SessionDay[] {
  const byDate = new Map<string, NoteRow[]>();
  for (const n of currentNotes(rows)) byDate.set(n.sessionDate, [...(byDate.get(n.sessionDate) ?? []), n]);
  const taughtBy = new Map<string, TaughtRow[]>();
  for (const t of taught) taughtBy.set(t.noteId, [...(taughtBy.get(t.noteId) ?? []), t]);
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, notes]): SessionDay => {
      const shared = notes.filter((n) => n.published);
      const seen = new Set<string>();
      const units: DayUnit[] = [];
      for (const n of shared) {
        for (const t of taughtBy.get(n.id) ?? []) {
          const k = `${t.curriculumId}/${t.unitCode}`;
          if (seen.has(k)) continue;
          seen.add(k);
          units.push({ curriculumId: t.curriculumId, code: t.unitCode, title: titleOf(t.curriculumId, t.unitCode) });
        }
      }
      return {
        date,
        noteIds: notes.map((n) => n.id),
        sessions: 1,
        sameDay: notes.length > 1,
        units,
        authors: [...new Set(notes.map((n) => n.authorRole))],
        privateOnly: shared.length === 0,
      };
    });
}

const monthOf = (iso: string) => iso.slice(0, 7);
function nextMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}

/** Newest first, from the month of the first session to the current one; months without a session are listed with 0. */
export function months(days: SessionDay[], todayIso: string): MonthSummary[] {
  if (days.length === 0) return [];
  const first = monthOf(days[0]!.date);
  const lastDay = monthOf(days[days.length - 1]!.date);
  const end = lastDay > monthOf(todayIso) ? lastDay : monthOf(todayIso);
  const out: MonthSummary[] = [];
  for (let m = first; m <= end; m = nextMonth(m)) {
    const ds = days.filter((d) => monthOf(d.date) === m);
    out.push({ month: m, sessions: ds.reduce((a, d) => a + d.sessions, 0), days: ds });
  }
  return out.reverse();
}

/** Monday of the week of `iso`. */
export function weekStart(iso: string): string {
  const dow = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(iso, -dow);
}

/**
 * Average per week (U12): sessions in the last 8 FULL weeks (Mon–Sun, the running week is not counted) ÷ 8; when the first session is
 * newer, ÷ the full weeks since the week of the first session (at least 1); no full week yet → null.
 */
export function stats(days: SessionDay[], todayIso: string): SessionStats {
  const total = days.reduce((a, d) => a + d.sessions, 0);
  const thisMonth = days.filter((d) => monthOf(d.date) === monthOf(todayIso)).reduce((a, d) => a + d.sessions, 0);
  const past = days.filter((d) => d.date <= todayIso);
  const last = past.length > 0 ? past[past.length - 1]!.date : null;
  let perWeek: number | null = null;
  if (days.length > 0) {
    const thisWeek = weekStart(todayIso);
    const sinceFirst = Math.round((Date.parse(`${thisWeek}T00:00:00Z`) - Date.parse(`${weekStart(days[0]!.date)}T00:00:00Z`)) / (7 * 86_400_000));
    const weeks = Math.min(8, sinceFirst);
    if (weeks >= 1) {
      const from = addDays(thisWeek, -7 * weeks);
      const n = days.filter((d) => d.date >= from && d.date < thisWeek).reduce((a, d) => a + d.sessions, 0);
      perWeek = Math.round((n / weeks) * 10) / 10;
    }
  }
  return { total, thisMonth, perWeek, last };
}

/** `weeks` rows (12 by default), Monday first; the last row holds today; later days are `future`. */
export function weekGrid(days: SessionDay[], todayIso: string, weeks = 12): WeekRow[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const first = addDays(weekStart(todayIso), -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) => {
    const ws = addDays(first, 7 * w);
    return {
      weekStart: ws,
      cells: Array.from({ length: 7 }, (_, i) => {
        const date = addDays(ws, i);
        return { date, future: date > todayIso, day: byDate.get(date) ?? null };
      }),
    };
  });
}

/** "2026-11-03" → "03/11". */
export const dayMonth = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** "2026-11" → "11/2026". */
export const monthLabel = (m: string): string => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

/** The text to paste into Zalo (U25), with the child's alias. */
export function monthText(alias: string, m: MonthSummary): string {
  return sessionMonthCopy.text(alias, monthLabel(m.month), m.sessions, m.days.map((d) => dayMonth(d.date)).join(", "));
}
