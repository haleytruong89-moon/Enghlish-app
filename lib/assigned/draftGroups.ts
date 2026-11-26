/**
 * Bản nháp (Giao bài and Bài tập › Bản nháp, hướng B v2 26/11): the Studio drafts not given yet. Pure.
 * - "Sẵn sàng giao" first: approved drafts (one click from giving), in Unit order.
 * - Then the rest grouped by Unit: "Kế tiếp" (the first Unit by number, not "Đã học" / "Bỏ qua" in the main curriculum) open and
 *   first; the other open Units in order; Review and Progress Test together; Units already "Đã học" / "Bỏ qua"; titles with no Unit.
 * Unknown Unit statuses (no main curriculum, or unreadable): Unit order only, nothing claimed as "Kế tiếp".
 */
import type { UnitStatus } from "@/lib/curriculum/types";
import { unitKeyOf, unitOrder } from "@/lib/results/score";
import type { DraftListItem } from "@/lib/studio/types";

export type DraftGroup = { key: string; unitKey: string | null; status: UnitStatus | null; next: boolean; closed: boolean; drafts: DraftListItem[] };
export type DraftBoard = { ready: DraftListItem[]; groups: DraftGroup[] };

/** Not discarded, not replaced by a newer version, not given to the child yet. */
export function openDrafts(drafts: readonly DraftListItem[]): DraftListItem[] {
  return drafts.filter((d) => d.status !== "discarded" && !d.superseded && d.assigned === 0);
}

const OTHER = "other";
const REVIEW = "review";
const byTitle = (a: DraftListItem, b: DraftListItem) => a.title.localeCompare(b.title, "vi", { numeric: true }) || a.id.localeCompare(b.id);
const keyOf = (d: DraftListItem) => unitKeyOf([], d.title);
const groupKey = (k: string | null) => (k === null ? OTHER : /^U\d+$/.test(k) ? k : REVIEW);
const order = (k: string | null) => (k === null ? 9999 : unitOrder(k));

export function groupDraftsByUnit(drafts: readonly DraftListItem[], statusOf: Readonly<Record<string, UnitStatus>> | null): DraftGroup[] {
  const groups = new Map<string, DraftListItem[]>();
  for (const d of drafts) {
    const k = groupKey(keyOf(d));
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  const closed = (k: string) => statusOf?.[k] === "done" || statusOf?.[k] === "skipped";
  const units = [...groups.keys()].filter((k) => k !== OTHER && k !== REVIEW).sort((a, b) => unitOrder(a) - unitOrder(b));
  const next = statusOf === null ? null : (units.find((k) => !closed(k)) ?? null);
  const ordered = [
    ...(next ? [next] : []),
    ...units.filter((k) => k !== next && !closed(k)),
    ...(groups.has(REVIEW) ? [REVIEW] : []),
    ...units.filter((k) => closed(k)),
    ...(groups.has(OTHER) ? [OTHER] : []),
  ];
  return ordered.map((k) => {
    const unit = /^U\d+$/.test(k) ? k : null;
    const list = [...(groups.get(k) ?? [])];
    // Review / Progress Test: in the order of the Units they review, then by title.
    list.sort(k === REVIEW ? (a, b) => order(keyOf(a)) - order(keyOf(b)) || byTitle(a, b) : byTitle);
    return { key: k, unitKey: unit, status: unit ? (statusOf?.[unit] ?? null) : null, next: k === next, closed: unit !== null && closed(unit), drafts: list };
  });
}

/** The whole drafts area: approved drafts first (in Unit order), the rest by Unit. */
export function draftBoard(drafts: readonly DraftListItem[], statusOf: Readonly<Record<string, UnitStatus>> | null): DraftBoard {
  const open = openDrafts(drafts);
  const ready = open.filter((d) => d.status === "approved").sort((a, b) => order(keyOf(a)) - order(keyOf(b)) || byTitle(a, b));
  return { ready, groups: groupDraftsByUnit(open.filter((d) => d.status !== "approved"), statusOf) };
}
