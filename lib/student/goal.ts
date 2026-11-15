/**
 * W4d · the weekly goal (plan §3.5). Pure. The ledger `weekly_goals` is append-only: the child PROPOSES a number of pieces per week, the child's
 * tutor ACCEPTS it or ADJUSTS it (another number), the child can WITHDRAW a proposal that still waits. A decision taken at time t counts from
 * the Monday after t (S-6) — also the very first one — and the goal of week W is the newest decision whose `appliesFrom` is not after W.
 */
import { addWeeks, type IsoDate } from "./week";

export type GoalKind = "propose" | "accept" | "adjust" | "withdraw";
export type GoalRow = {
  id: string;
  kind: GoalKind;
  /** null only for a withdrawal. */
  pieces: number | null;
  /** The Monday a decision starts to count; null for a proposal / withdrawal. */
  appliesFrom: IsoDate | null;
  /** The proposal an accept / adjust / withdraw answers. */
  respondsTo: string | null;
  byRole: "student" | "tutor";
  createdAt: string;
};

export const GOAL_LIMITS = { min: 1, max: 14 } as const;
export type GoalRange = { min: number; max: number };

const isDecision = (g: GoalRow) => g.kind === "accept" || g.kind === "adjust";

/** The proposal still waiting for the tutor (nobody answered it). At most one exists; if the data ever has more, the newest wins. */
export function pendingProposal(goals: readonly GoalRow[]): GoalRow | null {
  const answered = new Set(goals.filter((g) => g.respondsTo !== null).map((g) => g.respondsTo as string));
  const open = goals.filter((g) => g.kind === "propose" && !answered.has(g.id));
  return open.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0] ?? null;
}

/** Decisions oldest first (by the time they were taken). */
function decisions(goals: readonly GoalRow[]): GoalRow[] {
  return goals.filter((g) => isDecision(g) && g.appliesFrom !== null && g.pieces !== null).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** The goal (pieces per week) of a week: the newest decision with appliesFrom <= week. null = no agreed goal that week. */
export function goalForWeek(goals: readonly GoalRow[], week: IsoDate): number | null {
  let found: number | null = null;
  for (const d of decisions(goals)) if ((d.appliesFrom as IsoDate) <= week) found = d.pieces;
  return found;
}

/** The Monday the first agreed goal starts to count; null = never agreed. */
export function firstGoalWeek(goals: readonly GoalRow[]): IsoDate | null {
  const d = decisions(goals).map((x) => x.appliesFrom as IsoDate).sort()[0];
  return d ?? null;
}

/** An agreed goal that has not started yet (taken this week, starts next Monday) and differs from the running goal. null = nothing to announce. */
export function upcomingGoal(goals: readonly GoalRow[], currentWeek: IsoDate): { pieces: number; from: IsoDate } | null {
  let found: { pieces: number; from: IsoDate } | null = null;
  for (const d of decisions(goals)) if ((d.appliesFrom as IsoDate) > currentWeek) found = { pieces: d.pieces as number, from: d.appliesFrom as IsoDate };
  if (!found) return null;
  return found.pieces === goalForWeek(goals, currentWeek) ? null : found;
}

/**
 * "Mấy tuần gần đây bạn làm a–b bài": the smallest and largest count of the (up to) four newest FULL weeks, counting from the week of the first
 * piece of work (earlier weeks say nothing). No full week, or nothing sent in them → null (no sentence).
 */
export function recentRange(counts: ReadonlyMap<IsoDate, number>, currentWeek: IsoDate, firstWorkWeek: IsoDate | null): { low: number; high: number } | null {
  if (firstWorkWeek === null) return null;
  const values: number[] = [];
  for (let back = 1; back <= 4; back += 1) {
    const w = addWeeks(currentWeek, -back);
    if (w < firstWorkWeek) break;
    values.push(counts.get(w) ?? 0);
  }
  if (values.length === 0 || Math.max(...values) === 0) return null;
  return { low: Math.min(...values), high: Math.max(...values) };
}

/** Options the child can pick: every whole number of the track's range (track_settings.weekly_goal_range). */
export function goalOptions(range: GoalRange): number[] {
  const out: number[] = [];
  for (let n = range.min; n <= range.max; n += 1) out.push(n);
  return out;
}

