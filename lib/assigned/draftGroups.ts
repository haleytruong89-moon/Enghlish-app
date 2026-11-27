/**
 * Bản nháp (Giao bài and Bài tập › Bản nháp, hướng B v2 26/11): the Studio drafts not given yet. Pure.
 * One order for everything, from the main curriculum's Unit statuses:
 *   "Kế tiếp" (the first Unit by number, not "Đã học" / "Bỏ qua", among ALL open drafts) → the other open Units → Review and
 *   Progress Test (in book order) → Units already "Đã học" / "Bỏ qua" → numbered series ("Đọc · L1 · In the Sky · Buổi 3/4": one group
 *   per series, sessions by number, 27/11) → titles with no Unit ("Bài không theo Unit").
 * "Sẵn sàng giao" (approved, not given) comes first in that order; the rest are grouped by Unit in that order.
 * Unknown statuses (no main curriculum, or unreadable): Unit order only, nothing claimed as "Kế tiếp".
 */
import type { UnitStatus } from "@/lib/curriculum/types";
import { unitKeyOf, unitOrder } from "@/lib/results/score";
import type { DraftListItem } from "@/lib/studio/types";

export type DraftGroup = {
  key: string; unitKey: string | null; status: UnitStatus | null; next: boolean; closed: boolean; drafts: DraftListItem[];
  /** A reading series: its name as the first draft spells it (the key is normalized). */
  label?: string;
};
export type ReadyDraft = { draft: DraftListItem; unitKey: string | null; status: UnitStatus | null; next: boolean };
export type DraftBoard = { ready: ReadyDraft[]; groups: DraftGroup[] };
type StatusOf = Readonly<Record<string, UnitStatus>> | null;

/** Not discarded, not replaced by a newer version, not given to the child yet. */
export function openDrafts(drafts: readonly DraftListItem[]): DraftListItem[] {
  return drafts.filter((d) => d.status !== "discarded" && !d.superseded && d.assigned === 0);
}

const OTHER = "other";
const REVIEW = "review";
const isUnit = (k: string | null): k is string => k !== null && /^U\d+$/.test(k);
const byTitle = (a: DraftListItem, b: DraftListItem) => a.title.localeCompare(b.title, "vi", { numeric: true }) || a.id.localeCompare(b.id);
const keyOf = (d: DraftListItem) => unitKeyOf([], d.title);
const tidy = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();
/** A session number n of m: n ≤ m ≤ 40, so a d/m date ("Buổi 27/11") is never read as one. */
const MAX_SESSIONS = 40;
/**
 * "Đọc · L1 · In the Sky · Buổi 3/4 · Stars" → { name: "Đọc · L1 · In the Sky", n: 3 }: the series a numbered session belongs to.
 * NFC and single spaces first (titles typed on another device, or imported JSON, may be NFD).
 */
export function sessionOf(title: string): { name: string; n: number } | null {
  const m = /^(.+?)\s*·\s*Buổi\s*(\d+)\s*\/\s*(\d+)/i.exec(tidy(title));
  if (!m) return null;
  const n = Number(m[2]), of = Number(m[3]);
  return n >= 1 && n <= of && of <= MAX_SESSIONS ? { name: m[1]!.trim(), n } : null;
}
export const seriesOf = (title: string): string | null => sessionOf(title)?.name ?? null;
export const SERIES = "series:";
/** Same series whatever the case or spacing ("In the Sky" / "In the sky"). */
const seriesKey = (name: string) => `${SERIES}${name.toLocaleLowerCase("vi")}`;
/**
 * A numbered series stays one group even when a session title names a Unit ("… · Buổi 2/4 · Unit 3 words"); a series whose own name
 * is a Unit ("Unit 15 · Buổi 1/2") belongs to that Unit.
 */
const groupKey = (d: DraftListItem) => {
  const s = seriesOf(d.title);
  if (s && keyOf({ ...d, title: s }) === null) return seriesKey(s);
  const k = keyOf(d);
  if (k !== null) return isUnit(k) ? k : REVIEW;
  return OTHER;
};
const closedIn = (statusOf: StatusOf, k: string) => statusOf?.[k] === "done" || statusOf?.[k] === "skipped";

/**
 * Book position of a Review / Progress Test: the last Unit it covers ("(Units 25–26)" → 26); without a range, Review N ≈ Unit 2N
 * (Destination: two Units per Review). A test comes right after the Review that ends on the same Unit.
 */
export function reviewPosition(title: string): number {
  const range = /units?\s*\d{1,2}\s*[–-]\s*(\d{1,2})/i.exec(title);
  const pt = /\bprogress test\b/i.test(title) ? 0.5 : 0;
  if (range) return Number(range[1]) + pt;
  const r = /\breview\s*(\d{1,2})\b/i.exec(title);
  if (r) return 2 * Number(r[1]);
  const p = /\bprogress test\s*(\d{1,2})\b/i.exec(title);
  return p ? 100 * Number(p[1]) + pt : 9999;
}

/** "Kế tiếp" over all open drafts (approved ones too): the first Unit by number that is not closed. */
function nextUnit(drafts: readonly DraftListItem[], statusOf: StatusOf): string | null {
  if (statusOf === null) return null;
  const units = [...new Set(drafts.map(keyOf).filter(isUnit))].sort((a, b) => unitOrder(a) - unitOrder(b));
  return units.find((k) => !closedIn(statusOf, k)) ?? null;
}

/** [band, position] in the one order above. */
function rank(d: DraftListItem, statusOf: StatusOf, next: string | null): [number, number] {
  const g = groupKey(d);
  if (g.startsWith(SERIES)) return [4, sessionOf(d.title)!.n];
  if (g === OTHER) return [5, 0];
  const k = keyOf(d);
  if (k === null) return [5, 0];
  if (!isUnit(k)) return [2, reviewPosition(d.title)];
  if (k === next) return [0, 0];
  return [closedIn(statusOf, k) ? 3 : 1, unitOrder(k)];
}
const compare = (statusOf: StatusOf, next: string | null) => (a: DraftListItem, b: DraftListItem) => {
  const [ba, pa] = rank(a, statusOf, next);
  const [bb, pb] = rank(b, statusOf, next);
  // Series: by series name first, then by session number.
  const series = ba === 4 && bb === 4 ? groupKey(a).localeCompare(groupKey(b), "vi", { numeric: true }) : 0;
  return ba - bb || series || pa - pb || byTitle(a, b);
};

export function groupDraftsByUnit(drafts: readonly DraftListItem[], statusOf: StatusOf, next: string | null = nextUnit(drafts, statusOf)): DraftGroup[] {
  const sorted = [...drafts].sort(compare(statusOf, next));
  const groups = new Map<string, DraftListItem[]>();
  for (const d of sorted) {
    const k = groupKey(d);
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  // Map keeps insertion order = the order of each group's first draft, which follows the bands.
  return [...groups.entries()].map(([k, list]) => {
    const unit = isUnit(k) ? k : null;
    const label = k.startsWith(SERIES) ? (seriesOf(list[0]!.title) ?? undefined) : undefined;
    return { key: k, unitKey: unit, status: unit ? (statusOf?.[unit] ?? null) : null, next: unit !== null && unit === next, closed: unit !== null && closedIn(statusOf, unit), drafts: list, ...(label ? { label } : {}) };
  });
}

/** The whole drafts area: approved drafts first, the rest by Unit, both in the one order. */
export function draftBoard(drafts: readonly DraftListItem[], statusOf: StatusOf): DraftBoard {
  const open = openDrafts(drafts);
  const next = nextUnit(open, statusOf);
  const ready = open
    .filter((d) => d.status === "approved")
    .sort(compare(statusOf, next))
    .map((d): ReadyDraft => {
      const k = keyOf(d);
      return { draft: d, unitKey: k, status: isUnit(k) ? (statusOf?.[k] ?? null) : null, next: isUnit(k) && k === next };
    });
  return { ready, groups: groupDraftsByUnit(open.filter((d) => d.status !== "approved"), statusOf, next) };
}
