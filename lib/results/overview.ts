/**
 * Tiến bộ › Tổng quan (hướng B, 26/11): four numbers, the first-try chart, the weakest / strongest knowledge items. Pure, adults only.
 * Same measure as the rest of Kết quả: counted works (first attempts) only; a % needs at least one decided question; unknown = null.
 * "4 tuần" = the 28 Vietnam days up to today, compared with the 28 days before.
 */
import { addDays, todayVn } from "@/lib/inquiries/dates";
import { RESULT_RULES } from "./actions";
import { add, pct, ratio, type TagAgg, type Tally, type WorkScore } from "./score";

export type MainUnits = { title: string; currentCode: string | null; currentTitle: string | null; done: number; total: number };
export const OVERVIEW_DAYS = 28;
export const CHART_MAX = 20;
export type ChartPoint = { instanceId: string; title: string; unitKey: string | null; day: string; pct: number; correct: number; decided: number };
export type Overview = {
  sent: { now: number; before: number };
  firstTry: { now: number | null; before: number | null; diff: number | null };
  waiting: { works: number; oldestDays: number | null };
  main: MainUnits | null;
  points: ChartPoint[];
  weakest: TagAgg[];
  strongest: TagAgg[];
};

const ZERO: Tally = { correct: 0, decided: 0, pending: 0 };
const dayOf = (iso: string) => todayVn(new Date(iso));

export function buildOverview(works: readonly WorkScore[], tags: readonly TagAgg[], main: MainUnits | null, todayIso: string): Overview {
  const startNow = addDays(todayIso, -(OVERVIEW_DAYS - 1));
  const startBefore = addDays(todayIso, -(2 * OVERVIEW_DAYS - 1));
  const counted = works.filter((w) => w.counted);
  const inNow = counted.filter((w) => dayOf(w.submittedAt) >= startNow && dayOf(w.submittedAt) <= todayIso);
  const inBefore = counted.filter((w) => dayOf(w.submittedAt) >= startBefore && dayOf(w.submittedAt) < startNow);
  const now = pct(inNow.map((w) => w.tally).reduce(add, ZERO));
  const before = pct(inBefore.map((w) => w.tally).reduce(add, ZERO));
  const waitingWorks = works.filter((w) => w.needsAdult);
  const points = counted
    .filter((w) => w.tally.decided > 0)
    .map((w): ChartPoint => ({ instanceId: w.instanceId, title: w.title, unitKey: w.unitKey, day: dayOf(w.submittedAt), pct: pct(w.tally) ?? 0, correct: w.tally.correct, decided: w.tally.decided }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.instanceId.localeCompare(b.instanceId))
    .slice(-CHART_MAX);
  const judged = tags.filter((t) => t.tally.decided >= RESULT_RULES.minItems);
  const asc = [...judged].sort((a, b) => (ratio(a.tally) ?? 0) - (ratio(b.tally) ?? 0) || a.key.localeCompare(b.key));
  const weakest = asc.filter((t) => (ratio(t.tally) ?? 1) < RESULT_RULES.praiseFrom).slice(0, 3);
  const strongest = [...asc].reverse().filter((t) => !weakest.includes(t) && (ratio(t.tally) ?? 0) >= RESULT_RULES.praiseFrom).slice(0, 3);
  return {
    sent: { now: inNow.length, before: inBefore.length },
    firstTry: { now, before, diff: now !== null && before !== null ? now - before : null },
    waiting: { works: waitingWorks.length, oldestDays: waitingWorks.length ? Math.max(...waitingWorks.map((w) => w.waitingDays)) : null },
    main,
    points,
    weakest,
    strongest,
  };
}
