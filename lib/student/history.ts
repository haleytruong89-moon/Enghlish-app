/** W4b · Đã làm / Đã xem (plan 3.2): filters, the status of one row. Pure. A row is "seen" only when an adult acted on it (decided in SQL). */
import type { HistoryRow, SeenRow } from "./types";

export type HistoryFilter = "all" | "waiting" | "seen";

export function filterHistory(rows: readonly HistoryRow[], filter: HistoryFilter): HistoryRow[] {
  return rows.filter((r) => (filter === "all" ? true : filter === "seen" ? r.seen : !r.seen));
}

/** The numbers of the filters ("Tất cả (n)", "Chờ … xem (n)"): totals of the child's own sent work over the WHOLE list (the database counts them), not of the page. */
export function historyCounts(total: number, waiting: number): { all: number; waiting: number } {
  return { all: total, waiting: Math.min(waiting, total) };
}

/** A seen row without any message ("Thầy/cô đã xem bài này") vs a row with praise / items. */
export function hasMessage(r: SeenRow): boolean {
  return r.praise !== null || r.notes.length > 0 || r.closingNote !== null;
}
