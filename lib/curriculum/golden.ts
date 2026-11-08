/**
 * Golden set of "Đọc mục lục" (spec §5 "Bộ đề chuẩn"): compare a normalized AI draft with the expected units of a real book. Run on
 * every change of prompt or model (scripts/golden-curriculum.ts with the real PDF; the CI runs it on the fake fixture). Pure.
 */
import type { CurriculumPayload } from "./schema";

export type GoldenUnit = { code: string; title: string; section: string | null; page: number | null };
export type Golden = { source: string; units: GoldenUnit[]; ignored_count: number };
export type GoldenReport = {
  ok: boolean;
  expected: number;
  got: number;
  /** Codes in the wrong place or missing / extra. */
  orderOk: boolean;
  missing: string[];
  extra: string[];
  titleMismatches: string[];
  pageMismatches: string[];
};

const norm = (s: string) => s.toLowerCase().replace(/[\s\-–—]+/g, " ").trim();

export function compareGolden(draft: CurriculumPayload, golden: Golden): GoldenReport {
  const got = draft.units.filter((u) => !u.dropped);
  const want = golden.units;
  const gotCodes = got.map((u) => u.code);
  const wantCodes = want.map((u) => u.code);
  const missing = wantCodes.filter((c) => !gotCodes.includes(c));
  const extra = gotCodes.filter((c) => !wantCodes.includes(c));
  const orderOk = missing.length === 0 && extra.length === 0 && gotCodes.every((c, i) => c === wantCodes[i]);
  const titleMismatches: string[] = [];
  const pageMismatches: string[] = [];
  for (const w of want) {
    const g = got.find((u) => u.code === w.code);
    if (!g) continue;
    if (norm(g.title) !== norm(w.title)) titleMismatches.push(w.code);
    if (w.page !== null && g.page !== w.page) pageMismatches.push(w.code);
  }
  return {
    ok: orderOk && titleMismatches.length === 0 && pageMismatches.length === 0,
    expected: want.length,
    got: got.length,
    orderOk,
    missing,
    extra,
    titleMismatches,
    pageMismatches,
  };
}
