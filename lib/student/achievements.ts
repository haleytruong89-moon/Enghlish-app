/**
 * W4d · achievements v1 (plan §3.7, Q20). Pure and DERIVED: no table. An achievement is "earned" while its condition is true (streak and weeks
 * achievements: it was true once); its date is the start of the latest unbroken stretch in which the condition has been true, rebuilt from the
 * ledgers (submission times, Unit events, weeks that met the goal). Not earned yet → the work that is still missing (a count of the child's
 * own work, never a comparison). Shown: everything earned + the three closest to being earned. No coins, no points, no ranking.
 * `cando_n` ("n điều tự làm được") belongs to W4e.
 */
import { dayVn, type IsoDate } from "./week";
import { longestRun, streakEverDate, totalWeeksMet, weeksMetDate, type WeekResult } from "./streak";

export type UnitStatus = "not_started" | "in_progress" | "done" | "skipped";
export type UnitEvent = { u: string; s: UnitStatus; at: string };
export type UnitInfo = { code: string; ord: number; skipped: boolean };
export type FlagInfo = { id: string; title: string; afterUnit: string };

export type AchievementFacts = {
  /** The database's today (Vietnam time): the day an achievement of the running week is dated. */
  today: IsoDate;
  /** Time of the very first piece of work the child sent (any), or null. */
  firstWorkAt: string | null;
  /** One time per ACT-WRITE step the child sent: when its first submission happened. Oldest first. */
  writes: readonly string[];
  /** One time per topic work whose app steps are ALL sent: when the last of them was sent. Oldest first. */
  topicsDone: readonly string[];
  /** Times the child sent a revision (S6). Oldest first. */
  revisions: readonly string[];
  /** Unit events of the MAIN curriculum, oldest first (events of Units that left the version are ignored). */
  unitEvents: readonly UnitEvent[];
  /** Units of the version in use + the flags drawn on the mountain (confirmed milestones after a Unit of it). */
  units: readonly UnitInfo[];
  flags: readonly FlagInfo[];
  /** Weeks since the first agreed goal (streak.ts weekHistory). */
  history: readonly WeekResult[];
};

export type AchievementKind = "first_work" | "units" | "units_all" | "streak" | "weeks" | "writing" | "topic_first" | "revision_first" | "milestone";

export type AchievementItem = {
  key: string;
  kind: AchievementKind;
  /** The threshold (n Units, n weeks, n pieces); null for a first-time item and for "all Units". */
  n: number | null;
  /** The milestone name (kind = "milestone"). */
  title: string | null;
  earned: boolean;
  /** Vietnam date; null while not earned (or when the ledgers cannot tell). */
  date: IsoDate | null;
  /** What the child has so far / what the item needs: have/need is the closeness used to pick the "nearly there" ones (earned: have = need). */
  have: number;
  need: number;
};

export const UNIT_LADDER_FIXED = [2, 4, 8] as const;
export const STREAK_LADDER = [4, 8, 12] as const;
export const WEEKS_LADDER = [10, 20] as const;
export const WRITING_LADDER = [10, 25] as const;
export const NEARLY_SHOWN = 3;

/** 2, 4, 8, 12, 16, 20, 24, … below the number of counted Units (the last rung is "Xong cả giáo trình"). */
export function unitLadder(total: number): number[] {
  const out: number[] = [];
  for (const n of UNIT_LADDER_FIXED) if (n < total) out.push(n);
  for (let n = 12; n < total; n += 4) out.push(n);
  return out;
}

type State = ReadonlyMap<string, UnitStatus>;
const statusOf = (s: State, code: string): UnitStatus => s.get(code) ?? "not_started";

/** Replays the events: the time the predicate last turned true and stayed true until now; null when it is not true now. */
function sinceTrue(events: readonly UnitEvent[], inVersion: ReadonlySet<string>, pred: (s: State) => boolean): string | null {
  const state = new Map<string, UnitStatus>();
  let since: string | null = null;
  let was = pred(state);
  for (const e of events) {
    if (!inVersion.has(e.u)) continue;
    state.set(e.u, e.s);
    const now = pred(state);
    if (now && !was) since = e.at;
    if (!now) since = null;
    was = now;
  }
  return was ? since : null;
}

function counted(units: readonly UnitInfo[], s: State): UnitInfo[] {
  return units.filter((u) => !u.skipped && statusOf(s, u.code) !== "skipped");
}

const doneCount = (units: readonly UnitInfo[], s: State) => counted(units, s).filter((u) => statusOf(s, u.code) === "done").length;

function finalState(events: readonly UnitEvent[], inVersion: ReadonlySet<string>): State {
  const st = new Map<string, UnitStatus>();
  for (const e of events) if (inVersion.has(e.u)) st.set(e.u, e.s);
  return st;
}

const ymd = (at: string | null): IsoDate | null => (at === null ? null : dayVn(at));

/** Every achievement the child could have, earned or not (unmet families: only the NEXT rung). Order = family order of the plan. */
export function allAchievements(f: AchievementFacts): AchievementItem[] {
  const out: AchievementItem[] = [];
  const inVersion = new Set(f.units.map((u) => u.code));
  const now = finalState(f.unitEvents, inVersion);

  // first_work
  out.push({ key: "first_work", kind: "first_work", n: null, title: null, earned: f.firstWorkAt !== null, date: ymd(f.firstWorkAt), have: f.firstWorkAt ? 1 : 0, need: 1 });

  // units_n + the whole curriculum
  const total = counted(f.units, now).length;
  const done = doneCount(f.units, now);
  const rungs = unitLadder(total);
  let nextUnit = true;
  for (const n of rungs) {
    const earned = done >= n;
    if (!earned && !nextUnit) continue;
    if (!earned) nextUnit = false;
    out.push({ key: `units_${n}`, kind: "units", n, title: null, earned, date: earned ? ymd(sinceTrue(f.unitEvents, inVersion, (s) => doneCount(f.units, s) >= n)) : null, have: Math.min(done, n), need: n });
  }
  if (total > 0) {
    const earned = done >= total;
    if (earned || nextUnit) {
      out.push({
        key: "units_all", kind: "units_all", n: null, title: null, earned,
        date: earned ? ymd(sinceTrue(f.unitEvents, inVersion, (s) => { const c = counted(f.units, s); return c.length > 0 && c.every((u) => statusOf(s, u.code) === "done"); })) : null,
        have: done, need: total,
      });
    }
  }

  // streak_n and weeks_n (from the weeks that met the goal)
  const best = longestRun(f.history);
  const metTotal = totalWeeksMet(f.history);
  const ladderItems = (ladder: readonly number[], kind: "streak" | "weeks", have: number, dateOf: (n: number) => IsoDate | null) => {
    let first = true;
    for (const n of ladder) {
      const earned = have >= n;
      if (!earned && !first) continue;
      if (!earned) first = false;
      out.push({ key: `${kind}_${n}`, kind, n, title: null, earned, date: earned ? dateOf(n) : null, have: Math.min(have, n), need: n });
    }
  };
  ladderItems(STREAK_LADDER, "streak", best, (n) => streakEverDate(f.history, n, f.today));
  ladderItems(WEEKS_LADDER, "weeks", metTotal, (n) => weeksMetDate(f.history, n, f.today));

  // writing_n
  let firstW = true;
  for (const n of WRITING_LADDER) {
    const earned = f.writes.length >= n;
    if (!earned && !firstW) continue;
    if (!earned) firstW = false;
    out.push({ key: `writing_${n}`, kind: "writing", n, title: null, earned, date: earned ? ymd(f.writes[n - 1] ?? null) : null, have: Math.min(f.writes.length, n), need: n });
  }

  // topic_first, revision_first
  out.push({ key: "topic_first", kind: "topic_first", n: null, title: null, earned: f.topicsDone.length > 0, date: ymd(f.topicsDone[0] ?? null), have: f.topicsDone.length > 0 ? 1 : 0, need: 1 });
  out.push({ key: "revision_first", kind: "revision_first", n: null, title: null, earned: f.revisions.length > 0, date: ymd(f.revisions[0] ?? null), have: f.revisions.length > 0 ? 1 : 0, need: 1 });

  // milestone:<id> — a flag whose Units are all done (at least one counted Unit before it; a flag with nothing before it proves nothing)
  const ordOf = new Map(f.units.map((u) => [u.code, u.ord]));
  for (const flag of f.flags) {
    const ord = ordOf.get(flag.afterUnit);
    if (ord === undefined) continue;
    const before = (s: State) => counted(f.units, s).filter((u) => u.ord <= ord);
    const pred = (s: State) => { const b = before(s); return b.length > 0 && b.every((u) => statusOf(s, u.code) === "done"); };
    const b = before(now);
    const dn = b.filter((u) => statusOf(now, u.code) === "done").length;
    const earned = pred(now);
    out.push({ key: `milestone:${flag.id}`, kind: "milestone", n: null, title: flag.title, earned, date: earned ? ymd(sinceTrue(f.unitEvents, inVersion, pred)) : null, have: dn, need: Math.max(1, b.length) });
  }
  return out;
}

/** What the page shows: all earned (newest first, undated last) and the NEARLY_SHOWN unmet ones closest to done. */
export function pickShown(items: readonly AchievementItem[], nearly = NEARLY_SHOWN): { earned: AchievementItem[]; nearly: AchievementItem[] } {
  const rank = new Map(items.map((it, i) => [it.key, i]));
  const earned = items
    .filter((i) => i.earned)
    .sort((a, b) => (a.date === b.date ? (rank.get(a.key) as number) - (rank.get(b.key) as number) : a.date === null ? 1 : b.date === null ? -1 : a.date < b.date ? 1 : -1));
  const unmet = items
    .filter((i) => !i.earned)
    .sort((a, b) => b.have / b.need - a.have / a.need || (rank.get(a.key) as number) - (rank.get(b.key) as number));
  return { earned, nearly: unmet.slice(0, nearly) };
}

export function achievementsFor(f: AchievementFacts): { earned: AchievementItem[]; nearly: AchievementItem[] } {
  return pickShown(allAchievements(f));
}
