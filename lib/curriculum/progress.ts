/**
 * "Đang học đến" and coverage of one curriculum (DOMAIN §5.1) — derived, rebuilt from the unit events every time (bất biến §7.5). Pure.
 *   - current status of a unit = its latest event (no event = not started);
 *   - "đang học đến" = the in-progress unit with the highest order; else the done unit with the highest order; else none;
 *   - coverage = done ÷ units not skipped, over the units of the version in use (skipped = marked in the version OR latest event "skipped");
 *   - events of codes that are not in the version are ignored (a unit dropped in v2 keeps its history but no longer counts).
 */
import type { UnitStatus } from "./types";

export type ProgressUnit = { code: string; ord: number; title: string; skipped: boolean };
export type UnitEventRow = { unitCode: string; status: UnitStatus; at: string; id: string };
export type CurriculumProgress = {
  current: ProgressUnit | null;
  done: number;
  total: number;
  /** Whole percent, 0 when there is nothing to count. */
  pct: number;
  statusOf: Record<string, UnitStatus>;
};

export function latestStatuses(events: UnitEventRow[]): Map<string, UnitStatus> {
  const sorted = [...events].sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at < b.at ? -1 : 1));
  const out = new Map<string, UnitStatus>();
  for (const e of sorted) out.set(e.unitCode, e.status);
  return out;
}

export function curriculumProgress(units: ProgressUnit[], events: UnitEventRow[]): CurriculumProgress {
  const latest = latestStatuses(events);
  const statusOf: Record<string, UnitStatus> = Object.fromEntries(units.map((u) => [u.code, latest.get(u.code) ?? "not_started"]));
  const counted = units.filter((u) => !u.skipped && statusOf[u.code] !== "skipped");
  const done = counted.filter((u) => statusOf[u.code] === "done").length;
  const highest = (s: UnitStatus) => units.filter((u) => statusOf[u.code] === s).sort((a, b) => b.ord - a.ord)[0] ?? null;
  const total = counted.length;
  return { current: highest("in_progress") ?? highest("done"), done, total, pct: total > 0 ? Math.round((done * 100) / total) : 0, statusOf };
}

/** Units chosen in "Unit đã dạy hôm nay" that the app proposes to mark "Đang học" (the tutor clicks; never automatic): not started yet. */
export function proposeInProgress(chosen: string[], statusOf: Record<string, UnitStatus>): string[] {
  return chosen.filter((c) => (statusOf[c] ?? "not_started") === "not_started");
}
