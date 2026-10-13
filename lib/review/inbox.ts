import type { InboxItem } from "./types";

export const FILTERS = ["todo", "tutor", "independent", "baseline", "practice", "done"] as const;
export type InboxFilter = (typeof FILTERS)[number];

export const isDone = (i: InboxItem) => i.targetsDecided >= i.targetsTotal;

export function parseFilter(v: string | string[] | undefined): InboxFilter {
  const s = Array.isArray(v) ? v[0] : v;
  return (FILTERS as readonly string[]).includes(s ?? "") ? (s as InboxFilter) : "todo";
}

/** Default = not yet fully decided; the category filters also show only what is still open; "done" = every skill decided. Oldest first. */
export function filterInbox(items: InboxItem[], filter: InboxFilter): InboxItem[] {
  const pick = (i: InboxItem) => {
    if (filter === "done") return isDone(i);
    if (isDone(i)) return false;
    return filter === "todo" ? true : i.category === filter;
  };
  return items.filter(pick).sort((a, b) => (a.submittedAt === b.submittedAt ? a.episodeId.localeCompare(b.episodeId) : a.submittedAt.localeCompare(b.submittedAt)));
}

export function inboxCounts(items: InboxItem[]): Record<InboxFilter, number> {
  return Object.fromEntries(FILTERS.map((f) => [f, filterInbox(items, f).length])) as Record<InboxFilter, number>;
}
