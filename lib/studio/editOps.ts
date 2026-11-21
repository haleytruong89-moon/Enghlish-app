/**
 * Structural edits of a Studio draft on "Duyệt đề": remove a question or a whole part, add a question or a part, move a question to
 * another part. After each one the questions are numbered 1..N in the order of the screen (parts in their order, then the old number),
 * so the tutor never has to repair numbers by hand. Pure; the input is never mutated.
 */
import type { StudioDraft, StudioItem } from "./schema";

/** Sorts after every real number: "at the end of its part". */
const LAST = Number.MAX_SAFE_INTEGER;

/** Questions in screen order, numbered 1..N. Unknown parts go last (the validator still flags them). */
export function renumber(d: StudioDraft): StudioDraft {
  const partAt = new Map(d.parts.map((p, k) => [p.key, k]));
  const at = (i: StudioItem) => partAt.get(i.part) ?? d.parts.length;
  const ordered = d.items
    .map((item, pos) => ({ item, pos }))
    .sort((a, b) => at(a.item) - at(b.item) || a.item.n - b.item.n || a.pos - b.pos)
    .map(({ item }, k) => (item.n === k + 1 ? item : { ...item, n: k + 1 }));
  return { ...d, items: ordered };
}

/** True when the numbers are not already 1..N in screen order. */
export function numberingBroken(d: StudioDraft): boolean {
  const r = renumber(d).items;
  return r.some((item, k) => item !== d.items[k]);
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
