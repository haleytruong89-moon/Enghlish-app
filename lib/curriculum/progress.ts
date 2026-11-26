/**
 * "Đang học đến" and coverage of one curriculum (DOMAIN §5.1) — derived, rebuilt from the unit events every time (bất biến §7.5). Pure.
 *   - current status of a unit = its latest event (no event = not started);
 *   - "đang học đến" = the in-progress unit with the highest order; else the done unit with the highest order; else none;
 *   - coverage = done ÷ units not skipped, over the units of the version in use (skipped = marked in the version OR latest event "skipped");
 *   - events of codes that are not in the version are ignored (a unit dropped in v2 keeps its history but no longer counts).
 *   - L2 (0044): the app's "Đang học" from work the child sent counts as one more event at the time of the newest work, only up from
 *     "Chưa bắt đầu" (never down, never over the adult); an adult event after it wins. Coverage counts only "Đã học", which only an
 *     adult sets.
 */
import type { UnitStatus } from "./types";

export type ProgressUnit = { code: string; ord: number; title: string; skipped: boolean };
export type UnitEventRow = { unitCode: string; status: UnitStatus; at: string; id: string };
/** The app's "Đang học" for one unit (english.eng_unit_auto): the newest work the child sent of that unit. */
export type AutoUnitEvent = { unitCode: string; at: string };
export type CurriculumProgress = {
  current: ProgressUnit | null;
  done: number;
  total: number;
  /** Whole percent, 0 when there is nothing to count. */
  pct: number;
  statusOf: Record<string, UnitStatus>;
  /** Units whose status now comes from the app (work sent): when. The page says "app đặt theo bài nộp". */
  autoOf: Record<string, string>;
};

/**
 * The adult's events with the app's "Đang học" merged in (pure, defensive: the database already filters). An auto event is kept only
 * when, at its time, the adult had left the unit at nothing / "Chưa bắt đầu".
 */
export function mergeAutoEvents(events: readonly UnitEventRow[], auto: readonly AutoUnitEvent[]): UnitEventRow[] {
  const kept = auto.filter((a) => {
    const before = latestStatuses(events.filter((e) => e.unitCode === a.unitCode && e.at <= a.at)).get(a.unitCode);
    return before === undefined || before === "not_started";
  });
  return [...events, ...kept.map((a) => ({ unitCode: a.unitCode, status: "in_progress" as const, at: a.at, id: `auto:${a.unitCode}` }))];
}

export function latestStatuses(events: UnitEventRow[]): Map<string, UnitStatus> {
  const sorted = [...events].sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at < b.at ? -1 : 1));
  const out = new Map<string, UnitStatus>();
  for (const e of sorted) out.set(e.unitCode, e.status);
  return out;
}

export function curriculumProgress(units: ProgressUnit[], events: UnitEventRow[], auto: readonly AutoUnitEvent[] = []): CurriculumProgress {
  const merged = mergeAutoEvents(events, auto);
  const latest = latestStatuses(merged);
  // Which units stand where they do because of the app's event (the last event of the unit is the auto one).
  const lastId = new Map<string, string>();
  for (const e of [...merged].sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at < b.at ? -1 : 1))) lastId.set(e.unitCode, e.id);
  const autoOf: Record<string, string> = {};
  for (const a of auto) if (lastId.get(a.unitCode) === `auto:${a.unitCode}`) autoOf[a.unitCode] = a.at;
  const statusOf: Record<string, UnitStatus> = Object.fromEntries(units.map((u) => [u.code, latest.get(u.code) ?? "not_started"]));
  const counted = units.filter((u) => !u.skipped && statusOf[u.code] !== "skipped");
  const done = counted.filter((u) => statusOf[u.code] === "done").length;
  const highest = (s: UnitStatus) => units.filter((u) => statusOf[u.code] === s).sort((a, b) => b.ord - a.ord)[0] ?? null;
  const total = counted.length;
  return { current: highest("in_progress") ?? highest("done"), done, total, pct: total > 0 ? Math.round((done * 100) / total) : 0, statusOf, autoOf };
}

/** Units chosen in "Unit đã dạy hôm nay" that the app proposes to mark "Đang học" (the tutor clicks; never automatic): not started yet. */
export function proposeInProgress(chosen: string[], statusOf: Record<string, UnitStatus>): string[] {
  return chosen.filter((c) => (statusOf[c] ?? "not_started") === "not_started");
}
