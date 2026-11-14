/**
 * Moving a row between the Units table and the "Không phải Unit" list while a curriculum is still a DRAFT (UX round 2, item 6). Pure.
 * Only the draft payload changes (units / ignored are both arrays in the stored JSON), so there is no new column and no SQL.
 * An approved version never changes: fixing it means a new version ("Sửa mục lục / bảng nối").
 */
import { unitCodeOf } from "./normalize";
import type { CurriculumPayload, IgnoredRow, UnitDraft } from "./schema";
import { CURRICULUM_LIMITS as L, type IgnoredReason } from "./types";

const PROGRESS_TEST_RE = /progress\s*test|kiểm tra tiến độ/i;

/** "Kiểm tra tiến độ": the AI sometimes files a Progress Test under "review", so the name counts too (V17). */
export function isProgressTest(r: Pick<IgnoredRow, "label" | "reason">): boolean {
  return r.reason === "test" || PROGRESS_TEST_RE.test(r.label);
}

const clip = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max).trim();

/** True when "Không phải Unit" already holds the most rows the version may keep: the move is refused (never silently cut). */
export const nonUnitFull = (p: CurriculumPayload): boolean => p.ignored.length >= L.ignored;
/** True when the Units table is full: "Đưa về Unit" is refused. */
export const unitsFull = (p: CurriculumPayload): boolean => p.units.length >= L.units;

/** A Unit row the tutor says is not a Unit (a Review, a test, a reference page). Refused (payload unchanged) when the list is full: see nonUnitFull. */
export function moveToNonUnit(p: CurriculumPayload, unitIndex: number, reason: IgnoredReason): CurriculumPayload {
  const u = p.units[unitIndex];
  if (!u || u.dropped || nonUnitFull(p)) return p;
  const label = clip(u.title, L.ignoredLabel) || u.code;
  // from_ai_index links the row to the AI row that stays in the draft (dropped), so it can come back by identity, not by title.
  const ignored: IgnoredRow[] = [...p.ignored, { label, page: u.page, reason, ...(u.ai_index !== null ? { from_ai_index: u.ai_index } : {}) }];
  const units =
    u.ai_index !== null
      ? // An AI row stays (marked dropped) so the edit count stays honest.
        p.units.map((x, i) => (i === unitIndex ? { ...x, dropped: true, edit_reason: "not_a_unit" as const } : x))
      : p.units.filter((_, i) => i !== unitIndex);
  return { units, ignored };
}

function freeCode(p: CurriculumPayload, label: string): string {
  const used = new Set(p.units.map((u) => u.code));
  const base = unitCodeOf(label) ?? "X-ROW";
  let code = base;
  for (let n = 2; used.has(code); n++) code = `${base.slice(0, 20 - String(n).length - 1)}-${n}`;
  return code;
}

/**
 * A row of "Không phải Unit" the tutor says IS a Unit. If it is the very row that was marked "not a unit" a moment ago it comes back as it was;
 * otherwise a new manual row is made (it needs a look: "Cần xem") at its place in book order.
 */
export function moveToUnit(p: CurriculumPayload, ignoredIndex: number): CurriculumPayload {
  const r = p.ignored[ignoredIndex];
  if (!r) return p;
  const ignored = p.ignored.filter((_, i) => i !== ignoredIndex);
  const back =
    r.from_ai_index === undefined ? -1 : p.units.findIndex((u) => u.dropped && u.edit_reason === "not_a_unit" && u.ai_index === r.from_ai_index);
  if (back >= 0) return { units: p.units.map((u, i) => (i === back ? { ...u, dropped: false, edit_reason: null } : u)), ignored };
  if (unitsFull(p)) return p;
  const unit: UnitDraft = {
    code: freeCode(p, r.label),
    title: clip(r.label, L.unitTitle),
    section: null,
    page: r.page,
    skipped: false,
    points: [],
    missing_points: [],
    needs_review: true,
    review_reason: null,
    flags: [],
    origin: "manual",
    ai_index: null,
    dropped: false,
    edit_reason: null,
  };
  const at = r.page === null ? -1 : p.units.findIndex((u) => !u.dropped && u.page !== null && u.page > (r.page as number));
  const units = at < 0 ? [...p.units, unit] : [...p.units.slice(0, at), unit, ...p.units.slice(at)];
  return { units, ignored };
}

/**
 * "Lấy lại dòng" on a row that was moved to "Không phải Unit": the row comes back and its twin in "Không phải Unit" is removed,
 * so it is never in both lists. Any other dropped row just comes back. edit_reason is cleared in both cases.
 */
export function restoreUnit(p: CurriculumPayload, unitIndex: number): CurriculumPayload {
  const u = p.units[unitIndex];
  if (!u || !u.dropped) return p;
  const twin = u.edit_reason === "not_a_unit" && u.ai_index !== null ? p.ignored.findIndex((r) => r.from_ai_index === u.ai_index) : -1;
  return {
    units: p.units.map((x, i) => (i === unitIndex ? { ...x, dropped: false, edit_reason: null } : x)),
    ignored: twin >= 0 ? p.ignored.filter((_, i) => i !== twin) : p.ignored,
  };
}

/**
 * The Units a Review / Progress Test row revises: those after the previous row of its kind and up to its own page. A Review stops at the previous
 * Review or test; a Progress Test at the previous Progress Test (it covers the whole stretch). A Unit without a page takes the page of the one before it.
 */
export function relatedUnits(p: CurriculumPayload, ignoredIndex: number): string[] {
  const r = p.ignored[ignoredIndex];
  if (!r || r.page === null) return [];
  const here = r.page;
  const test = isProgressTest(r);
  const prevPage = p.ignored
    .filter((o, i) => i !== ignoredIndex && o.page !== null && o.page < here && (o.reason === "review" || o.reason === "test" || isProgressTest(o)) && (!test || isProgressTest(o)))
    .reduce<number>((m, o) => Math.max(m, o.page as number), -1);
  let carried = 0;
  const out: string[] = [];
  for (const u of p.units) {
    if (u.page !== null) carried = u.page;
    if (u.dropped || u.skipped) continue;
    if (carried > prevPage && carried <= here) out.push(u.code);
  }
  return out;
}
