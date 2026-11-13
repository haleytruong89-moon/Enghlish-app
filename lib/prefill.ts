/**
 * Pre-filling "Tạo bài từ đề" and "Giao bài luyện" from a row of the contents page ("Review 2", "Progress Test 1"), through URL parameters.
 * Everything read back is cleaned: the page only ever shows the text and never trusts it. Pure.
 */
import { UNIT_CODE_RE } from "@/lib/curriculum/types";

export const PREFILL_TITLE_MAX = 160; // the shortest title box it fills (Studio: 160; the assign form allows 200);
export const PREFILL_UNITS_MAX = 12;

export type Prefill = { title: string | null; pages: string | null; units: string[] };

const stripControls = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

/** "U3","U4" → "3–4"; "U1","U2","U4" → "1–2, 4"; other codes (X-STARTER) follow as they are. */
export function formatRange(codes: string[]): string {
  const nums = codes.map((c) => /^U(\d+)$/.exec(c)).filter((m): m is RegExpExecArray => m !== null).map((m) => Number(m[1])).sort((a, b) => a - b);
  const other = codes.filter((c) => !/^U\d+$/.test(c));
  const parts: string[] = [];
  for (let i = 0; i < nums.length; ) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j]! + 1) j++;
    parts.push(j > i ? `${nums[i]}–${nums[j]}` : String(nums[i]));
    i = j + 1;
  }
  return [...parts, ...other].join(", ");
}

export function buildPrefill(p: { title?: string | null; pages?: string | null; units?: string[] }): URLSearchParams {
  const sp = new URLSearchParams();
  const title = stripControls(p.title ?? "").slice(0, PREFILL_TITLE_MAX);
  if (title) sp.set("title", title);
  const pages = stripControls(p.pages ?? "").slice(0, 40);
  if (pages) sp.set("pages", pages);
  const units = (p.units ?? []).filter((u) => UNIT_CODE_RE.test(u)).slice(0, PREFILL_UNITS_MAX);
  if (units.length > 0) sp.set("units", units.join(","));
  return sp;
}

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function readPrefill(sp: SearchParams): Prefill {
  const title = stripControls(one(sp.title) ?? "").slice(0, PREFILL_TITLE_MAX);
  const pages = stripControls(one(sp.pages) ?? "");
  const units = (one(sp.units) ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter((u) => UNIT_CODE_RE.test(u))
    .slice(0, PREFILL_UNITS_MAX);
  return { title: title || null, pages: /^[0-9][0-9–\-, ]{0,39}$/.test(pages) ? pages : null, units };
}

/** The name given to a bài made from a row: "<book> · <row> (Unit 3–4)". */
export function prefillTitle(book: string, label: string, units: string[]): string {
  return `${book} · ${label}${units.length > 0 ? ` (Unit ${formatRange(units)})` : ""}`;
}
