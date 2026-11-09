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
 * ("Unit 3 · Nghe 8/10 · Đọc 12/15"); one part adds nothing. Never longer than the API allows.
 */
export function titleWithParts(title: string, rows: readonly PartRow[], word: (n: number) => string): string {
  const base = title.trim();
  if (rows.length < 2) return base;
  const suffix = ` — ${rows.map((r, i) => `${partLabel(r, i, word)} ${whole(r.correct) ?? 0}/${whole(r.total) ?? 0}`).join(" · ")}`;
  if (suffix.length > TITLE_MAX - 20) return base;
  return `${base.slice(0, TITLE_MAX - suffix.length).trimEnd()}${suffix}`;
}

/** "Sửa kết quả" of a stored quick result: one row holding the stored numbers. */
export function rowFromStored(total: number, correct: number, wrong: readonly number[]): PartRow {
  return { name: "", correct: String(correct), total: String(total), wrong: wrong.join(", ") };
}
