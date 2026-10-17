/**
 * Pure scoring of a test frame from the list of wrong items - shared by the grid on the page (client) and the unit tests.
 * Rule shown on the screen: an item that is not clicked is right; a blank answer is wrong (so tutors click it too).
 */
import type { FrameView } from "./types";

export type PartScore = {
  key: string;
  name: string;
  from: number;
  to: number;
  correct: number;
  total: number;
};
export type TagGroup = { tagKey: string; items: number[] };

export function scoreFrame(frame: FrameView, wrong: ReadonlySet<number>) {
  const wrongInFrame = frame.items.filter((i) => wrong.has(i.n));
  const parts: PartScore[] = frame.parts.map((p) => {
    const inPart = frame.items.filter((i) => i.part === p.key);
    const bad = inPart.filter((i) => wrong.has(i.n)).length;
    return {
      key: p.key,
      name: p.name,
      from: p.from,
      to: p.to,
      correct: inPart.length - bad,
      total: inPart.length,
    };
  });
  const byTag = new Map<string, number[]>();
  for (const i of wrongInFrame) byTag.set(i.tagKey, [...(byTag.get(i.tagKey) ?? []), i.n]);
  const tags: TagGroup[] = [...byTag.entries()]
    .map(([tagKey, items]) => ({ tagKey, items: items.sort((a, b) => a - b) }))
    .sort((a, b) => b.items.length - a.items.length || a.tagKey.localeCompare(b.tagKey));
  return {
    total: frame.totalItems,
    correct: frame.totalItems - wrongInFrame.length,
    wrong: wrongInFrame.map((i) => i.n).sort((a, b) => a - b),
    parts,
    tags,
  };
}

/** "4, 7, 9" for the numbers, ascending. */
export function itemList(items: readonly number[]): string {
  return [...items].sort((a, b) => a - b).join(", ");
}

/**
 * Parse "4, 7 9;12" into a sorted unique list. `ok: false` when something is not a whole number in 1..total, so the form can say so
 * instead of silently dropping it.
 */
export function parseItemNumbers(raw: string, total: number): { ok: true; items: number[] } | { ok: false } {
  const parts = raw.split(/[\s,;]+/).filter(Boolean);
  const out = new Set<number>();
  for (const p of parts) {
    if (!/^\d{1,4}$/.test(p)) return { ok: false };
    const n = Number(p);
    if (n < 1 || n > total) return { ok: false };
    out.add(n);
  }
  return { ok: true, items: [...out].sort((a, b) => a - b) };
}

/** x-key for a family's own tag: "Đảo ngữ với 'hardly'" → "x-dao-ngu-voi-hardly". Empty after cleaning → null. */
export function customTagKey(label: string): string | null {
  const slug = label
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
  return slug ? `x-${slug}` : null;
}
