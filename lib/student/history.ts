/** W4b · Đã làm / Đã xem (plan 3.2): filters, the status of one row. Pure. A row is "seen" only when an adult acted on it (decided in SQL). */
import type { HistoryRow, SeenRow } from "./types";

export type HistoryFilter = "all" | "waiting" | "seen";

export function filterHistory(rows: readonly HistoryRow[], filter: HistoryFilter): HistoryRow[] {
  return rows.filter((r) => (filter === "all" ? true : filter === "seen" ? r.seen : !r.seen));
}

/** The numbers of the three filters ("Tất cả (n)", "Chờ … xem (n)"): counts of the child's own submitted work. */
export function historyCounts(rows: readonly HistoryRow[]): { all: number; waiting: number; seen: number } {
  const seen = rows.filter((r) => r.seen).length;
  return { all: rows.length, waiting: rows.length - seen, seen };
}

export type SeenKind = "note" | "mark";
/** A seen row without any message ("Thầy/cô đã xem bài này") vs a row with praise / items. */
export function hasMessage(r: SeenRow): boolean {
  return r.praise !== null || r.notes.length > 0 || r.closingNote !== null;
}

/** Newest first, ties by ref (stable) — merging a "load more" page into the list without a duplicate. */
export function mergeRows<T extends { ref: string }>(current: readonly T[], more: readonly T[]): T[] {
  const seen = new Set(current.map((r) => r.ref));
  return [...current, ...more.filter((r) => !seen.has(r.ref))];
}
