/**
 * "Ghi điểm nhanh (bài link)": a quick result entered by part. Each part has an optional name, the number right, its own total and
 * the wrong items inside it (numbered 1..total of that part). Parts are laid end to end, so the stored result keeps the EXISTING shape
 * (one total, one correct, one list of wrong numbers 1..total): part 2 starts after the last item of part 1. Pure; no I/O.
 */
import { parseItemNumbers } from "./frameScore";

export type PartRow = { name: string; correct: string; total: string; wrong: string };
export const emptyPart = (): PartRow => ({ name: "", correct: "", total: "", wrong: "" });

export const ITEMS_MAX = 500;
const TITLE_MAX = 200;
const whole = (s: string) => (/^\d{1,3}$/.test(s) ? Number(s) : null);

export type PartError = "needTotal" | "needCorrect" | "wrongInvalid" | "wrongCountMismatch" | "tooMany";
export type WrongEntry = { n: number; part: number; local: number };

/** Running overall for the screen: counts only the rows whose numbers are valid so far. */
export function overall(rows: readonly PartRow[]): { correct: number; total: number } {
  let correct = 0;
  let total = 0;
  for (const r of rows) {
    const t = whole(r.total);
    const c = whole(r.correct);
    if (t === null || t < 1 || c === null || c > t) continue;
    total += t;
    correct += c;
  }
  return { correct, total };
}

export type PartsResult =
  | { ok: true; total: number; correct: number; wrong: number[]; entries: WrongEntry[] }
  | { ok: false; error: PartError; row: number };

/** The wrong items as they will be stored (global numbers) plus where each came from; or the first problem and its row (0-based). */
export function combineParts(rows: readonly PartRow[]): PartsResult {
  let offset = 0;
  let correct = 0;
  const entries: WrongEntry[] = [];
  for (const [i, r] of rows.entries()) {
    const t = whole(r.total);
    if (t === null || t < 1) return { ok: false, error: "needTotal", row: i };
    const c = whole(r.correct);
    if (c === null || c > t) return { ok: false, error: "needCorrect", row: i };
    const w = parseItemNumbers(r.wrong, t);
    if (!w.ok) return { ok: false, error: "wrongInvalid", row: i };
    if (w.items.length !== t - c) return { ok: false, error: "wrongCountMismatch", row: i };
    for (const local of w.items) entries.push({ n: offset + local, part: i, local });
    offset += t;
    correct += c;
    if (offset > ITEMS_MAX) return { ok: false, error: "tooMany", row: i };
  }
  return { ok: true, total: offset, correct, wrong: entries.map((e) => e.n), entries };
}

const partLabel = (r: PartRow, i: number, word: (n: number) => string) => r.name.trim() || word(i + 1);

/**
 * The title as stored. The result has no field for the breakdown, so with more than one part the per-part scores follow the title
 * ("Unit 3 — Nghe 8/10 · Đọc 12/15"); one part adds nothing (and removes a breakdown left by an earlier save). Never longer than the API allows.
 */
export function titleWithParts(title: string, rows: readonly PartRow[], word: (n: number) => string): string {
  return titleWithPartsInfo(title, rows, word).title;
}

/** "Sửa kết quả" of a stored quick result: one row holding the stored numbers. */
export function rowFromStored(total: number, correct: number, wrong: readonly number[]): PartRow {
  return { name: "", correct: String(correct), total: String(total), wrong: wrong.join(", ") };
}

/** A part's text as ` — Nghe 8/10 · Đọc 12/15` at the end of a stored title; used to strip it again when the result is edited. */
const BREAKDOWN_TAIL = / — [^—]+ \d{1,3}\/\d{1,3}(?: · [^—·]+ \d{1,3}\/\d{1,3})*$/u;
export const stripBreakdown = (title: string): string => title.replace(BREAKDOWN_TAIL, "").trim();

/** Title as stored, and whether the per-part breakdown had to be left out because the title would be too long (N2). */
export function titleWithPartsInfo(title: string, rows: readonly PartRow[], word: (n: number) => string): { title: string; dropped: boolean } {
  const base = stripBreakdown(title);
  if (rows.length < 2) return { title: base, dropped: false };
  const suffix = ` — ${rows.map((r, i) => `${partLabel(r, i, word)} ${whole(r.correct) ?? 0}/${whole(r.total) ?? 0}`).join(" · ")}`;
  if (suffix.length > TITLE_MAX - 20) return { title: base, dropped: true };
  return { title: `${base.slice(0, TITLE_MAX - suffix.length).trimEnd()}${suffix}`, dropped: false };
}

/** The wrong items typed, deduplicated and inside 1..total: the same set the validator (`parseItemNumbers`) accepts. Tolerant of half-typed text. */
export function wrongTyped(raw: string, total: number | null): number[] {
  if (total === null) return [];
  const out = new Set<number>();
  for (const p of raw.split(/[\s,;]+/).filter(Boolean)) {
    if (!/^\d{1,4}$/.test(p)) continue;
    const n = Number(p);
    if (n >= 1 && n <= total) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}
export const wrongTypedCount = (raw: string, total: number | null): number => wrongTyped(raw, total).length;

/** Tags are kept by (part index, item inside the part), so they do not shift when parts change; global numbers are derived at save. */
export type ItemTags = Record<string, string | null>;
export const tagId = (part: number, local: number): string => `${part}:${local}`;

/** Keep only the tags whose item still exists in the rows (item inside 1..total of its part and still listed as wrong). */
export function pruneTags(tags: ItemTags, rows: readonly PartRow[]): ItemTags {
  const alive = new Set<string>();
  rows.forEach((r, i) => {
    const t = whole(r.total);
    for (const local of wrongTyped(r.wrong, t)) alive.add(tagId(i, local));
  });
  return Object.fromEntries(Object.entries(tags).filter(([k]) => alive.has(k)));
}

/** A part was removed: drop its tags and move the later parts' tags one part up. */
export function dropPartTags(tags: ItemTags, removed: number): ItemTags {
  const out: ItemTags = {};
  for (const [k, v] of Object.entries(tags)) {
    const [part, local] = k.split(":").map(Number) as [number, number];
    if (part === removed) continue;
    out[tagId(part > removed ? part - 1 : part, local)] = v;
  }
  return out;
}

/** The tags to send: one per wrong item that has one, with the global number. */
export function tagsForSave(entries: readonly WrongEntry[], tags: ItemTags): { n: number; tag_key: string }[] {
  return entries.flatMap((e) => {
    const k = tags[tagId(e.part, e.local)];
    return k ? [{ n: e.n, tag_key: k }] : [];
  });
}
