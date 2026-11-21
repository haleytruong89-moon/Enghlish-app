/**
 * Structural edits of a Studio draft on "Duyệt đề": remove a question or a whole part, add a question or a part, move a question to
 * another part. After each one the questions are numbered 1..N in the order of the screen (parts in their order, then the old number),
 * so the tutor never has to repair numbers by hand. Pure; the input is never mutated.
 */
import type { StudioDraft, StudioItem } from "./schema";

/** Sorts after every real number: "at the end of its part". */
const LAST = Number.MAX_SAFE_INTEGER;

/**
 * Questions numbered 1..N. The order of the parts is the one their current numbers give (so a test whose part list is not in number
 * order keeps the numbers of the paper); a part without numbered questions (empty, or only a new question) comes right after the part
 * listed before it. Inside a part: the old number, then the old position. Unknown parts go last (the validator still flags them).
 */
export function renumber(d: StudioDraft): StudioDraft {
  const rank = new Map<string, [number, number]>();
  let previous = 0;
  d.parts.forEach((p, at) => {
    const real = d.items.filter((i) => i.part === p.key && i.n < LAST).map((i) => i.n);
    if (real.length > 0) previous = Math.min(...real);
    rank.set(p.key, [previous, at]);
  });
  const of = (i: StudioItem) => rank.get(i.part) ?? [LAST, d.parts.length];
  const ordered = d.items
    .map((item, pos) => ({ item, pos, r: of(item) }))
    .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.item.n - b.item.n || a.pos - b.pos)
    .map(({ item }, k) => (item.n === k + 1 ? item : { ...item, n: k + 1 }));
  return { ...d, items: ordered };
}

/** True when renumbering would change the number of any question (the order of the array alone does not count). */
export function numberingBroken(d: StudioDraft): boolean {
  const kept = new Set(d.items);
  return renumber(d).items.some((item) => !kept.has(item));
}

export function removeItem(d: StudioDraft, item: StudioItem): StudioDraft {
  return renumber({ ...d, items: d.items.filter((x) => x !== item) });
}

/** The part and every question in it. Reading texts stay in the draft; one that no question uses is not sent to the child. */
export function removePart(d: StudioDraft, key: string): StudioDraft {
  return renumber({ ...d, parts: d.parts.filter((p) => p.key !== key), items: d.items.filter((i) => i.part !== key) });
}

export function addItem(d: StudioDraft, part: string): StudioDraft {
  const blank: StudioItem = {
    n: LAST, part, kind: "gap", out_of_app: false, stem: "", options: [], passage_ref: null, key: null, accepted: [],
    tag_key: null, target_id: null, reading_skill_key: null, explanation_vi: "", needs_review: false, review_reason: null,
  };
  return renumber({ ...d, items: [...d.items, blank] });
}

/** A new empty part named by the first free letter (A, B, C… then A2, A3… if all 26 are taken). */
export function addPart(d: StudioDraft): StudioDraft {
  const used = new Set(d.parts.map((p) => p.key));
  let key = "";
  for (let c = 65; c <= 90 && !key; c++) if (!used.has(String.fromCharCode(c))) key = String.fromCharCode(c);
  for (let k = 2; !key; k++) if (!used.has(`A${k}`)) key = `A${k}`;
  return { ...d, parts: [...d.parts, { key, name: key, instructions: "" }] };
}

/** The question becomes the last one of the other part. */
export function moveToPart(d: StudioDraft, item: StudioItem, part: string): StudioDraft {
  return renumber({ ...d, items: d.items.map((x) => (x === item ? { ...x, part, n: LAST } : x)) });
}

/** Lên (-1) / Xuống (+1): swaps the question with its neighbour in the same part. At the edge of its part nothing changes (same object). */
export function moveWithinPart(d: StudioDraft, item: StudioItem, step: -1 | 1): StudioDraft {
  const inPart = d.items.filter((i) => i.part === item.part).sort((a, b) => a.n - b.n);
  const at = inPart.indexOf(item);
  const other = inPart[at + step];
  if (at < 0 || !other) return d;
  return renumber({ ...d, items: d.items.map((i) => (i === item ? { ...i, n: other.n } : i === other ? { ...i, n: item.n } : i)) });
}

