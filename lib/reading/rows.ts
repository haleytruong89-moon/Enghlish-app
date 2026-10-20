export type ReadingCell = { q: string; pct: string };
export type ReadingRowOut = { tag_key: string; questions: number; correct_pct: number };

const INT = /^\d{1,3}$/;

/**
 * Turns the form cells into the rows of the POST body, in the order of `tags`.
 * - both boxes empty -> the row is left out (no question that month);
 * - "Số câu" = 0 -> the row is left out too (the database rule stays questions >= 1, so 0 must never be sent);
 * - anything else must be whole numbers: questions 1..500, % 0..100, both filled -> otherwise `null` (the form shows an error).
 */
export function buildReadingRows(tags: { key: string }[], cells: Record<string, ReadingCell | undefined>): ReadingRowOut[] | null {
  const out: ReadingRowOut[] = [];
  for (const t of tags) {
    const c = cells[t.key] ?? { q: "", pct: "" };
    if (c.q === "" && c.pct === "") continue;
    if (!INT.test(c.q)) return null;
    const q = Number(c.q);
    if (q === 0) continue;
    if (!INT.test(c.pct)) return null;
    const pct = Number(c.pct);
    if (q > 500 || pct > 100) return null;
    out.push({ tag_key: t.key, questions: q, correct_pct: pct });
  }
  return out;
}
