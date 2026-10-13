/**
 * Calendar-date helpers for assigning and rescheduling inquiries. Pure (no I/O, no server-only imports), so the
 * zod schemas, the server page and the client form share one definition of "today" and of the allowed window.
 *
 * "Today" is the date in Asia/Ho_Chi_Minh (UTC+7, no daylight saving) — the same day the database uses in
 * english.eng_assign_inquiry / eng_activity_event / eng_my_released_steps.
 */

/** A due date or a reschedule date must be within [today - DAYS_BACK, today + DAYS_AHEAD]. */
export const DATE_WINDOW = { daysBack: 7, daysAhead: 120 } as const;

const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;

/** "YYYY-MM-DD" of `now` in Asia/Ho_Chi_Minh. */
export function todayVn(now: Date = new Date()): string {
  return new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** `iso` + `n` calendar days ("YYYY-MM-DD"; n may be negative). */
export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** The allowed window for a due date / reschedule date, given today. */
export function dateWindow(now: Date = new Date()): { min: string; max: string } {
  const today = todayVn(now);
  return { min: addDays(today, -DATE_WINDOW.daysBack), max: addDays(today, DATE_WINDOW.daysAhead) };
}

export function isWithinWindow(iso: string, now: Date = new Date()): boolean {
  const { min, max } = dateWindow(now);
  return iso >= min && iso <= max;
}

/**
 * Suggested due date for a template. A template whose week is still ahead (or running) keeps its own end
 * date. For one whose week has passed, the suggestion starts the same-length week today, so a late assignment
 * keeps the relative schedule (the database moves every step by due - template end date). Always inside the window.
 */
export function defaultDueOn(dateFrom: string, dateTo: string, now: Date = new Date()): string {
  const today = todayVn(now);
  const { min, max } = dateWindow(now);
  const span = Math.max(0, daysBetween(dateFrom, dateTo));
  const due = dateTo >= today ? dateTo : addDays(today, span);
  return due < min ? min : due > max ? max : due;
}
