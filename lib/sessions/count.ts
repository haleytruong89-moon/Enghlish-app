/**
 * Counting lesson sessions (pure, DOMAIN §5.6). One session = one calendar day (Asia/Ho_Chi_Minh, the note's session_date) with at least
 * one CURRENT lesson note (not replaced by a later version) written by a TUTOR, shared or not. A day with only parent-written notes is
 * listed (parentOnly) but is not a session: it is out of every total, average, month count and the Zalo text. Two notes the same day =
 * one session, flagged. No money here (U11). Output carries no ids (it crosses to client components).
 */
import { sessionBillingCopy, sessionMonthCopy } from "@/lib/copy/vi";
import { addDays } from "@/lib/inquiries/dates";
import type { AbsenceRow, DayUnit, MarkRow, MonthBilling, MonthSummary, NoteRow, SessionDay, SessionStats, TaughtRow, WeekRow } from "./types";

/** Notes that no other note replaces. A broken supersedes loop only drops its members (never loops forever). */
export function currentNotes(rows: NoteRow[]): NoteRow[] {
  const replaced = new Set(rows.map((r) => r.supersedesId).filter((x): x is string => x !== null));
  return rows.filter((r) => !replaced.has(r.id));
}

/**
 * The mark that applies to each CURRENT note (3B, U17): the newest mark (by created_at, then id) on ANY note of its chain, or null (= "Thường").
 * A broken supersedes loop cannot hang the walk.
 */
export function effectiveKinds(notes: NoteRow[], marks: MarkRow[]): Map<string, MarkRow | null> {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const marksOf = new Map<string, MarkRow[]>();
  for (const m of marks) marksOf.set(m.noteId, [...(marksOf.get(m.noteId) ?? []), m]);
  const out = new Map<string, MarkRow | null>();
  for (const cur of currentNotes(notes)) {
    const seen = new Set<string>();
    let best: MarkRow | null = null;
    for (let id: string | null = cur.id; id && !seen.has(id); id = byId.get(id)?.supersedesId ?? null) {
      seen.add(id);
      for (const m of marksOf.get(id) ?? []) {
        if (!best || m.createdAt > best.createdAt || (m.createdAt === best.createdAt && m.id > best.id)) best = m;
      }
    }
    out.set(cur.id, best);
  }
  return out;
}

/** Absences that are neither a "bỏ" row nor cancelled by one; date ascending. */
export function liveAbsences(rows: AbsenceRow[]): AbsenceRow[] {
  const cancelled = new Set(rows.map((r) => r.cancelsId).filter((x): x is string => x !== null));
  return rows
    .filter((r) => r.cancelsId === null && !cancelled.has(r.id))
    .sort((a, b) => (a.absentOn < b.absentOn ? -1 : a.absentOn > b.absentOn ? 1 : a.createdAt < b.createdAt ? -1 : 1));
}

/**
 * One entry per day that has a counted current note. A note marked "Không tính" is out (a day with only such notes is not listed).
 * Per day (U18): a regular tutor note = 1 session, a makeup tutor note = 1 more. A parent's note never makes a session, whatever its mark.
 */
export function sessionDays(rows: NoteRow[], taught: TaughtRow[], titleOf: (curriculumId: string, code: string) => string | null, marks: MarkRow[] = []): SessionDay[] {
  const kinds = effectiveKinds(rows, marks);
  const kindOf = (n: NoteRow): "regular" | "makeup" | "not_counted" => kinds.get(n.id)?.kind ?? "regular";
  const byDate = new Map<string, NoteRow[]>();
  for (const n of currentNotes(rows)) if (kindOf(n) !== "not_counted") byDate.set(n.sessionDate, [...(byDate.get(n.sessionDate) ?? []), n]);
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
          units.push({ code: t.unitCode, title: titleOf(t.curriculumId, t.unitCode) });
        }
      }
      const tutor = notes.filter((n) => n.authorRole === "tutor");
      const regular = tutor.some((n) => kindOf(n) === "regular");
      const makeup = tutor.some((n) => kindOf(n) === "makeup");
      const sameKind = (k: "regular" | "makeup") => notes.filter((n) => kindOf(n) === k).length > 1;
      return {
        date,
        sessions: (regular ? 1 : 0) + (makeup ? 1 : 0),
        regular,
        makeup,
        makeupFor: [...new Set(tutor.filter((n) => kindOf(n) === "makeup").map((n) => kinds.get(n.id)?.makeupFor).filter((x): x is string => !!x))],
        parentOnly: tutor.length === 0,
        sameDay: sameKind("regular") || sameKind("makeup"),
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

/** Billable sessions of one month (rule S-1, U19): sessions + billable absences - makeups that point to a billable live absence. */
export function monthBilling(month: string, days: SessionDay[], absences: AbsenceRow[]): MonthBilling {
  const live = liveAbsences(absences);
  const liveById = new Map(live.map((a) => [a.id, a]));
  const ds = days.filter((d) => monthOf(d.date) === month && d.sessions > 0);
  const abs = live.filter((a) => monthOf(a.absentOn) === month);
  const makeups = ds.filter((d) => d.makeup).length;
  const linked = ds.filter((d) => d.makeup && d.makeupFor.some((id) => liveById.get(id)?.billable)).length;
  const sessions = ds.reduce((a, d) => a + d.sessions, 0);
  const count = (who: AbsenceRow["requestedBy"]) => abs.filter((a) => a.requestedBy === who).length;
  return {
    sessions,
    makeups,
    absences: { student: count("student"), tutor: count("tutor"), other: count("other") },
    absenceTotal: abs.length,
    billable: sessions + abs.filter((a) => a.billable).length - linked,
    dates: ds.map((d) => d.date),
    absenceDates: abs.map((a) => ({ date: a.absentOn, requestedBy: a.requestedBy, billable: a.billable })),
  };
}

/** Newest first, from the month of the first session (or absence) to the current one; months without anything are listed with 0. */
export function months(days: SessionDay[], todayIso: string, absences: AbsenceRow[] = []): MonthSummary[] {
  const live = liveAbsences(absences);
  const all = [...days.map((d) => d.date), ...live.map((a) => a.absentOn)].sort();
  if (all.length === 0) return [];
  const first = monthOf(all[0]!);
  const lastDay = monthOf(all[all.length - 1]!);
  const end = lastDay > monthOf(todayIso) ? lastDay : monthOf(todayIso);
  const out: MonthSummary[] = [];
  for (let m = first; m <= end; m = nextMonth(m)) {
    const ds = days.filter((d) => monthOf(d.date) === m);
    out.push({ month: m, sessions: ds.reduce((a, d) => a + d.sessions, 0), days: ds, billing: monthBilling(m, days, absences) });
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
export function stats(allDays: SessionDay[], todayIso: string): SessionStats {
  const days = allDays.filter((d) => d.sessions > 0);
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
export function weekGrid(days: SessionDay[], todayIso: string, weeks = 12, absences: AbsenceRow[] = []): WeekRow[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const absentOn = new Map<string, { requestedBy: AbsenceRow["requestedBy"]; billable: boolean }>();
  for (const a of liveAbsences(absences)) if (!absentOn.has(a.absentOn)) absentOn.set(a.absentOn, { requestedBy: a.requestedBy, billable: a.billable });
  const first = addDays(weekStart(todayIso), -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) => {
    const ws = addDays(first, 7 * w);
    return {
      weekStart: ws,
      cells: Array.from({ length: 7 }, (_, i) => {
        const date = addDays(ws, i);
        return { date, future: date > todayIso, day: byDate.get(date) ?? null, absence: absentOn.get(date) ?? null };
      }),
    };
  });
}

/** "2026-11-03" → "03/11". */
export const dayMonth = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** "2026-11" → "11/2026". */
export const monthLabel = (m: string): string => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

/** The text to paste into Zalo (U25), with the child's alias. With absences or makeups it adds them and the billable count (3B); no money. */
export function monthText(alias: string, m: MonthSummary): string {
  const base = sessionMonthCopy.text(alias, monthLabel(m.month), m.sessions, m.days.filter((d) => d.sessions > 0).map((d) => dayMonth(d.date)).join(", "));
  const b = m.billing;
  if (b.absenceTotal === 0 && b.makeups === 0) return base;
  const parts = [base.replace(/\.$/, "")];
  if (b.makeups > 0) parts.push(sessionBillingCopy.textMakeups(b.makeups));
  if (b.absenceTotal > 0) parts.push(sessionBillingCopy.textAbsences(b.absenceTotal, b.absenceDates.map((a) => `${sessionBillingCopy.partyShort[a.requestedBy]}, ${a.billable ? sessionBillingCopy.billable : sessionBillingCopy.notBillable}`)));
  parts.push(sessionBillingCopy.textBillable(b.billable));
  return `${parts.join(" · ")}.`;
}
