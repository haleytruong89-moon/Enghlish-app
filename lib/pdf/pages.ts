/** Page lists typed by a person: "1-3, 7" (also the en dash "1–3"). Pages are 1-based on screen and 0-based inside the app. Pure. */

export function parsePages(text: string, pageCount: number): { ok: true; pages: number[] } | { ok: false; reason: "empty" | "syntax" | "range" } {
  const clean = text.replace(/[–—−]/g, "-").replace(/\s+/g, "");
  if (clean === "") return { ok: false, reason: "empty" };
  const set = new Set<number>();
  for (const part of clean.split(",")) {
    if (part === "") continue;
    const m = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(part);
    if (!m) return { ok: false, reason: "syntax" };
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    if (b < a) return { ok: false, reason: "syntax" };
    if (a < 1 || b > pageCount) return { ok: false, reason: "range" };
    for (let p = a; p <= b; p++) set.add(p - 1);
  }
  if (set.size === 0) return { ok: false, reason: "empty" };
  return { ok: true, pages: [...set].sort((x, y) => x - y) };
}

/** [0,1,2,6] → "1–3, 7". */
export function formatPages(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    out.push(j > i ? `${sorted[i]! + 1}–${sorted[j]! + 1}` : String(sorted[i]! + 1));
    i = j + 1;
  }
  return out.join(", ");
}
