/**
 * The state behind the "Giao theo Unit" picker (UX round 2B). Pure: no React, no database.
 *
 * A curriculum offers two kinds of rows: real Units (U3 · Unreal time) and Review / Progress Test rows. A Review row is NOT a Unit
 * (it has no code to point at): ticking it ticks the Units it revises (V10) and puts its name in the title; unticking one of those Units
 * unticks the Review row again. Only Units are saved with the assignment. Knowledge items are DERIVED from the ticked Units.
 */
import { unitPickerCopy } from "@/lib/copy/vi";
import { formatRange } from "@/lib/prefill";

/** The database accepts at most 30 Units per assignment. */
export const MAX_UNITS = 30;

export type UnitRow = { kind: "unit"; code: string; title: string; status: string; points: string[] };
export type ReviewRow = { kind: "review"; id: string; label: string; progressTest: boolean; related: string[] };
export type UnitChoice = { curriculumId: string; title: string; units: UnitRow[]; reviews: ReviewRow[] };

export type PickerState = { units: { curriculumId: string; code: string }[]; reviews: { curriculumId: string; id: string }[] };
export const emptyPicker: PickerState = { units: [], reviews: [] };

const same = (a: { curriculumId: string; code: string }, curriculumId: string, code: string) => a.curriculumId === curriculumId && a.code === code;
const choiceOf = (choices: UnitChoice[], curriculumId: string) => choices.find((c) => c.curriculumId === curriculumId);

export function isUnitTicked(s: PickerState, curriculumId: string, code: string): boolean {
  return s.units.some((u) => same(u, curriculumId, code));
}
export function isReviewTicked(s: PickerState, curriculumId: string, id: string): boolean {
  return s.reviews.some((r) => r.curriculumId === curriculumId && r.id === id);
}

export function toggleUnit(s: PickerState, choices: UnitChoice[], curriculumId: string, code: string): PickerState {
  if (!isUnitTicked(s, curriculumId, code)) return s.units.length >= MAX_UNITS ? s : { ...s, units: [...s.units, { curriculumId, code }] };
  const c = choiceOf(choices, curriculumId);
  const stillCovered = (id: string) => c?.reviews.find((r) => r.id === id)?.related.includes(code) !== true;
  return {
    units: s.units.filter((u) => !same(u, curriculumId, code)),
    reviews: s.reviews.filter((r) => r.curriculumId !== curriculumId || stillCovered(r.id)),
  };
}

/** Ticking a Review row ticks its Units (those not ticked yet, in book order, up to MAX_UNITS in all); unticking it leaves the Units alone. */
export function toggleReview(s: PickerState, choices: UnitChoice[], curriculumId: string, id: string): PickerState {
  if (isReviewTicked(s, curriculumId, id)) return { ...s, reviews: s.reviews.filter((r) => !(r.curriculumId === curriculumId && r.id === id)) };
  const row = choiceOf(choices, curriculumId)?.reviews.find((r) => r.id === id);
  if (!row) return s;
  const room = Math.max(0, MAX_UNITS - s.units.length);
  const add = row.related.filter((code) => !isUnitTicked(s, curriculumId, code)).slice(0, room).map((code) => ({ curriculumId, code }));
  return { units: [...s.units, ...add], reviews: [...s.reviews, { curriculumId, id }] };
}

/** Units named in the URL (A14 "Giao bài này →") → ticked, in the curriculum that has the most of them. Unknown codes are dropped. */
export function stateFromCodes(choices: UnitChoice[], codes: string[]): PickerState {
  let best: { c: UnitChoice; hit: string[] } | null = null;
  for (const c of choices) {
    const hit = codes.filter((code) => c.units.some((u) => u.code === code));
    if (hit.length > 0 && (!best || hit.length > best.hit.length)) best = { c, hit };
  }
  return best ? { units: best.hit.map((code) => ({ curriculumId: (best as { c: UnitChoice }).c.curriculumId, code })), reviews: [] } : emptyPicker;
}

/** "Destination C1 C2 · Unit 3–4" / "… · Review 2 (Unit 3–4)"; several curricula are joined with " + ". Empty when nothing is ticked. */
export function autoTitle(choices: UnitChoice[], s: PickerState): string {
  const parts: string[] = [];
  for (const c of choices) {
    const codes = c.units.filter((u) => isUnitTicked(s, c.curriculumId, u.code)).map((u) => u.code);
    const labels = c.reviews.filter((r) => isReviewTicked(s, c.curriculumId, r.id)).map((r) => r.label);
    if (codes.length === 0 && labels.length === 0) continue;
    const range = codes.length > 0 ? `Unit ${formatRange(codes)}` : "";
    const seg = labels.length > 0 ? `${labels.join(", ")}${range ? ` (${range})` : ""}` : range;
    parts.push(`${c.title}${unitPickerCopy.sep}${seg}`);
  }
  return parts.join(unitPickerCopy.titleJoin).slice(0, 200);
}

/** A ticked Review row that could not tick all its Units (the 30-Unit cap): some of its Units are not ticked. */
export function reviewIsPartial(choices: UnitChoice[], s: PickerState, curriculumId: string, id: string): boolean {
  if (!isReviewTicked(s, curriculumId, id)) return false;
  const row = choiceOf(choices, curriculumId)?.reviews.find((r) => r.id === id);
  return !!row && row.related.some((code) => !isUnitTicked(s, curriculumId, code));
}

/** The knowledge items of the ticked Units, in the same book order that is stored (see selectedUnits), each once. */
export function derivedItems(choices: UnitChoice[], s: PickerState): string[] {
  const out: string[] = [];
  for (const c of choices) {
    for (const u of c.units) {
      if (!isUnitTicked(s, c.curriculumId, u.code)) continue;
      for (const p of u.points) if (!out.includes(p)) out.push(p);
    }
  }
  return out;
}

/** The ticked Units in book order of each curriculum, as the request body wants them. */
export function selectedUnits(choices: UnitChoice[], s: PickerState): { curriculum_id: string; unit_code: string }[] {
  return choices.flatMap((c) =>
    c.units.filter((u) => isUnitTicked(s, c.curriculumId, u.code)).map((u) => ({ curriculum_id: c.curriculumId, unit_code: u.code })),
  );
}
