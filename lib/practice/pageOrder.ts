/**
 * W4c1 · the pages of a paper (or link-result) submission, as the child arranges them on the device. Pure: no I/O, no DOM.
 * The ORDER of the list is the order of the pages (it is the order the files are sent in, and the order the tutor reads them).
 * Rotation is a number of quarter turns clockwise; it is applied to the picture only when the work is sent.
 */

/** Pages in one submission (migration 0033 raised the database limit from 6 to 12). */
export const MAX_PAGES = 12;

export type Quarter = 0 | 1 | 2 | 3;
export type Paged = { key: string; quarter: Quarter };

const at = <T extends Paged>(pages: readonly T[], key: string) => pages.findIndex((p) => p.key === key);

/** Move one page one place up (towards page 1) or down. At the edge, or for an unknown key, nothing changes. */
export function movePage<T extends Paged>(pages: readonly T[], key: string, dir: "up" | "down"): T[] {
  const i = at(pages, key);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= pages.length) return [...pages];
  const next = [...pages];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

export function removePage<T extends Paged>(pages: readonly T[], key: string): T[] {
  return pages.filter((p) => p.key !== key);
}

/** A quarter turn clockwise: 0 → 1 → 2 → 3 → 0. */
export function rotatePage<T extends Paged>(pages: readonly T[], key: string): T[] {
  return pages.map((p) => (p.key === key ? { ...p, quarter: ((p.quarter + 1) % 4) as Quarter } : p));
}

/** Add pages at the end, up to `max` in total; `dropped` = how many did not fit (the screen says so). */
export function addPages<T extends Paged>(pages: readonly T[], incoming: readonly T[], max: number = MAX_PAGES): { pages: T[]; dropped: number } {
  const room = Math.max(0, max - pages.length);
  return { pages: [...pages, ...incoming.slice(0, room)], dropped: Math.max(0, incoming.length - room) };
}

/** Degrees for the CSS preview / the canvas. */
export const degrees = (q: Quarter): number => q * 90;

/** A compact fingerprint of the arrangement (order + turns): a retry with the same arrangement is the same work (same client id). */
export function arrangement(pages: readonly Paged[]): string {
  return pages.map((p) => `${p.key}:${p.quarter}`).join("|");
}
