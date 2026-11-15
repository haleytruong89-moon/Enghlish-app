/**
 * W4d · pieces counted per week, weeks that met the goal, and the soft weekly streak (plan §3.6, PRD D34). Pure.
 * One piece of work counts at most once per week (the database lists each (work, week) pair; this file dedupes again). Nothing here reads
 * minutes, app openings or links opened: only work the child sent (Q5 = i).
 */
import { goalForWeek, firstGoalWeek, type GoalRow } from "./goal";
import { addWeeks, weekEnd, weeksBetween, type IsoDate } from "./week";

/** One piece of work with at least one submission in a week (the database already bucketed the week, Monday start, Asia/Ho_Chi_Minh). */
export type WorkWeek = { k: string; w: IsoDate };
export const STREAK_MAX_WEEKS = 52;

export function countsByWeek(works: readonly WorkWeek[]): Map<IsoDate, number> {
  const seen = new Set<string>();
  const out = new Map<IsoDate, number>();
  for (const x of works) {
    const key = `${x.w}|${x.k}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.set(x.w, (out.get(x.w) ?? 0) + 1);
  }
  return out;
}

export type WeekResult = { week: IsoDate; goal: number | null; count: number; met: boolean };

export function weekResult(goals: readonly GoalRow[], counts: ReadonlyMap<IsoDate, number>, week: IsoDate): WeekResult {
  const goal = goalForWeek(goals, week);
  const count = counts.get(week) ?? 0;
  return { week, goal, count, met: goal !== null && count >= goal };
}

/**
 * The streak shown today. k = weeks that met the goal one after another, ending with the week BEFORE the running one; the running week adds one
 * if it already met the goal and never breaks anything (a finished week without an agreed goal or without enough work sets the streak to 0).
 */
export function currentStreak(goals: readonly GoalRow[], counts: ReadonlyMap<IsoDate, number>, currentWeek: IsoDate): number {
  let k = 0;
  for (let back = 1; back <= STREAK_MAX_WEEKS; back += 1) {
    if (!weekResult(goals, counts, addWeeks(currentWeek, -back)).met) break;
    k += 1;
  }
  return weekResult(goals, counts, currentWeek).met ? k + 1 : k;
}

/** Every week from the first agreed goal to the running week, oldest first (the base of "weeks met" and "ever streak" achievements). */
export function weekHistory(goals: readonly GoalRow[], counts: ReadonlyMap<IsoDate, number>, currentWeek: IsoDate): WeekResult[] {
  const first = firstGoalWeek(goals);
  if (first === null || first > currentWeek) return [];
  const out: WeekResult[] = [];
  for (let n = 0, total = weeksBetween(first, currentWeek); n <= total; n += 1) out.push(weekResult(goals, counts, addWeeks(first, n)));
  return out;
}

/** The first day the number of weeks that met the goal reached n (the end of that week, or today for the running week); null = not yet. */
export function weeksMetDate(history: readonly WeekResult[], n: number, today: IsoDate): IsoDate | null {
  let met = 0;
  for (const h of history) {
    if (h.met) met += 1;
    if (met >= n) return capDay(weekEnd(h.week), today);
  }
  return null;
}

/** The first day a run of n consecutive weeks that met the goal was complete ("the streak has been at least n"); null = never. */
export function streakEverDate(history: readonly WeekResult[], n: number, today: IsoDate): IsoDate | null {
  let run = 0;
  for (const h of history) {
    run = h.met ? run + 1 : 0;
    if (run >= n) return capDay(weekEnd(h.week), today);
  }
  return null;
}

export const totalWeeksMet = (history: readonly WeekResult[]): number => history.filter((h) => h.met).length;
export function longestRun(history: readonly WeekResult[]): number {
  let best = 0;
  let run = 0;
  for (const h of history) {
    run = h.met ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

const capDay = (d: IsoDate, today: IsoDate): IsoDate => (d > today ? today : d);
