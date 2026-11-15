/**
 * W4d · weeks of the weekly goal (PRD D34). Pure. A week starts on Monday 00:00 in Asia/Ho_Chi_Minh (UTC+7, no daylight saving) and is
 * named by its Monday as "YYYY-MM-DD". The clock is always the DATABASE clock handed in by the caller (never the browser's), so changing a
 * device's time cannot move a week.
 */

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type IsoDate = string;

const iso = (utcMs: number): IsoDate => new Date(utcMs).toISOString().slice(0, 10);

/** The Monday (Vietnam time) of the week an instant falls in. Accepts a Date, epoch ms or an ISO / Postgres timestamp string. */
export function weekStartVn(at: Date | number | string): IsoDate {
  const ms = at instanceof Date ? at.getTime() : typeof at === "number" ? at : Date.parse(at);
  if (!Number.isFinite(ms)) throw new RangeError("weekStartVn: not a time");
  const shifted = ms + VN_OFFSET_MS; // read the Vietnam wall clock with the UTC getters
  const sinceMonday = (new Date(shifted).getUTCDay() + 6) % 7;
  return iso(Math.floor(shifted / DAY_MS) * DAY_MS - sinceMonday * DAY_MS);
}

/** The calendar day (Vietnam time) of an instant, "YYYY-MM-DD". */
export function dayVn(at: Date | number | string): IsoDate {
  const ms = at instanceof Date ? at.getTime() : typeof at === "number" ? at : Date.parse(at);
  if (!Number.isFinite(ms)) throw new RangeError("dayVn: not a time");
  return iso(ms + VN_OFFSET_MS);
}

function parseIso(d: IsoDate): number {
  const m = ISO_DATE.exec(d);
  if (!m) throw new RangeError(`not a date: ${d}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function addDays(d: IsoDate, n: number): IsoDate {
  return iso(parseIso(d) + n * DAY_MS);
}

export function addWeeks(week: IsoDate, n: number): IsoDate {
  return addDays(week, 7 * n);
}

/** The Sunday that closes the week. */
export function weekEnd(week: IsoDate): IsoDate {
  return addDays(week, 6);
}

/** The Monday a decision taken at `at` starts to count (S-6: always the next Monday, even for the very first goal). */
export function appliesFromVn(at: Date | number | string): IsoDate {
  return addWeeks(weekStartVn(at), 1);
}

/** Whole weeks from `a` to `b` (both Mondays); negative when b is earlier. */
export function weeksBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((parseIso(b) - parseIso(a)) / (7 * DAY_MS));
}

/** "09/11" of "2026-11-09". */
export function ddmm(d: IsoDate): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

/** "09/11 – 15/11" of a week. */
export function weekRangeLabel(week: IsoDate): string {
  return `${ddmm(week)} – ${ddmm(weekEnd(week))}`;
}
