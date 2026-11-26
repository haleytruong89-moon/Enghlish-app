/**
 * Bài tập › Bản nháp (hướng B, 26/11): the Studio drafts not given yet, grouped by Unit, the next Unit to give first. Pure.
 * "Kế tiếp" = the first Unit by number with an open draft whose status in the main curriculum is not "Đã học" / "Bỏ qua".
 */
import type { UnitStatus } from "@/lib/curriculum/types";
import { unitKeyOf, unitOrder } from "@/lib/results/score";
import type { DraftListItem } from "@/lib/studio/types";

export type DraftGroup = { key: string; unitKey: string | null; status: UnitStatus | null; next: boolean; drafts: DraftListItem[] };

/** Same rule as Giao bài's "Bản nháp đang soạn": not discarded, not replaced by a newer version, not given to the child yet. */
export function openDrafts(drafts: readonly DraftListItem[]): DraftListItem[] {
  return drafts.filter((d) => d.status !== "discarded" && !d.superseded && d.assigned === 0);
}

const OTHER = "other";
const byTitle = (a: DraftListItem, b: DraftListItem) => a.title.localeCompare(b.title, "vi", { numeric: true }) || a.id.localeCompare(b.id);

export function groupDraftsByUnit(drafts: readonly DraftListItem[], statusOf: Readonly<Record<string, UnitStatus>> | null): DraftGroup[] {
  const groups = new Map<string, DraftListItem[]>();
  for (const d of drafts) {
    const k = unitKeyOf([], d.title) ?? OTHER;
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  const keys = [...groups.keys()].sort((a, b) => (a === OTHER ? 1 : b === OTHER ? -1 : unitOrder(a) - unitOrder(b) || a.localeCompare(b)));
  const isUnit = (k: string) => /^U\d+$/.test(k);
  const closed = (k: string) => statusOf?.[k] === "done" || statusOf?.[k] === "skipped";
  // Unknown statuses (no main curriculum, or it could not be read): no "Kế tiếp" claim — groups keep the Unit order only.
  const next = statusOf === null ? null : (keys.find((k) => isUnit(k) && !closed(k)) ?? null);
  const ordered = next ? [next, ...keys.filter((k) => k !== next)] : keys;
  return ordered.map((k) => ({
    key: k,
    unitKey: k === OTHER ? null : k,
    status: statusOf?.[k] ?? null,
    next: k === next,
    drafts: [...(groups.get(k) ?? [])].sort(byTitle),
  }));
}
