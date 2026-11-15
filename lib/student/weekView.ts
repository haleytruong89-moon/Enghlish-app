/**
 * W4d · facts of the weekly goal (what eng_my_week / eng_week_facts return) → what the screens draw. Pure. The ONLY clock is `facts.now`
 * (the database's), so a wrong device clock cannot move a week or a streak.
 */
import { achievementsFor, type AchievementFacts, type AchievementItem, type FlagInfo, type UnitEvent, type UnitInfo } from "./achievements";
import { firstGoalWeek, goalForWeek, pendingProposal, recentRange, upcomingGoal, type GoalRange, type GoalRow } from "./goal";
import { countsByWeek, currentStreak, weekHistory, type WorkWeek } from "./streak";
import { dayVn, weekRangeLabel, weekStartVn, type IsoDate } from "./week";

export type WeekFacts = {
  /** The database's clock (ISO). */
  now: string;
  range: GoalRange;
  goals: GoalRow[];
  works: WorkWeek[];
  firstWorkAt: string | null;
  writes: string[];
  firstTopicAt: string | null;
  firstRevisionAt: string | null;
  unitEvents: UnitEvent[];
};

export type WeekView = {
  today: IsoDate;
  week: IsoDate;
  /** "09/11 – 15/11" */
  rangeLabel: string;
  /** Pieces per week agreed for THIS week; null = no agreed goal yet. */
  goal: number | null;
  /** Pieces counted so far this week. */
  count: number;
  met: boolean;
  /** Pieces still to send to meet the goal (0 when met or no goal). */
  remaining: number;
  streak: number;
  pending: { id: string; pieces: number } | null;
  /** An agreed goal that starts next Monday and differs from this week's. */
  upcoming: { pieces: number; from: IsoDate } | null;
  range: GoalRange;
  suggestion: { low: number; high: number } | null;
  /** Monday the next decision would start. */
  nextMonday: IsoDate;
};

export function buildWeekView(f: WeekFacts): WeekView {
  const week = weekStartVn(f.now);
  const counts = countsByWeek(f.works);
  const goal = goalForWeek(f.goals, week);
  const count = counts.get(week) ?? 0;
  const pending = pendingProposal(f.goals);
  const firstWork = f.firstWorkAt ? weekStartVn(f.firstWorkAt) : null;
  const next = new Date(Date.parse(f.now) + 7 * 24 * 3_600_000);
  return {
    today: dayVn(f.now),
    week,
    rangeLabel: weekRangeLabel(week),
    goal,
    count,
    met: goal !== null && count >= goal,
    remaining: goal === null ? 0 : Math.max(0, goal - count),
    streak: currentStreak(f.goals, counts, week),
    pending: pending && pending.pieces !== null ? { id: pending.id, pieces: pending.pieces } : null,
    upcoming: upcomingGoal(f.goals, week),
    range: f.range,
    suggestion: recentRange(counts, week, firstWork),
    nextMonday: weekStartVn(next),
  };
}

/** The week the first agreed goal starts (null = never agreed). Exposed for the adult desk line. */
export const firstAgreedWeek = firstGoalWeek;

export function buildAchievementFacts(f: WeekFacts, units: readonly UnitInfo[], flags: readonly FlagInfo[]): AchievementFacts {
  const week = weekStartVn(f.now);
  return {
    today: dayVn(f.now),
    firstWorkAt: f.firstWorkAt,
    writes: f.writes,
    topicsDone: f.firstTopicAt ? [f.firstTopicAt] : [],
    revisions: f.firstRevisionAt ? [f.firstRevisionAt] : [],
    unitEvents: f.unitEvents,
    units,
    flags,
    history: weekHistory(f.goals, countsByWeek(f.works), week),
  };
}

export type ShownAchievements = { earned: AchievementItem[]; nearly: AchievementItem[] };
export function buildAchievements(f: WeekFacts, units: readonly UnitInfo[], flags: readonly FlagInfo[]): ShownAchievements {
  return achievementsFor(buildAchievementFacts(f, units, flags));
}
