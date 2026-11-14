/** Small pure helpers of the tutor page (labels, form <-> body conversion). */
import { roadmapCopy } from "@/lib/copy/vi";
import { formatDateVi } from "@/lib/inquiries/format";
import { parseDue } from "./proposals";
import type { MilestoneVersion, Proposal } from "./types";
import type { RoadmapCurriculum } from "./shape";
import type { MilestoneFields } from "./schemas";

/** "2027-03-01" → "03/2027"; the form shows and reads months this way. */
export const monthInput = (iso: string | null): string => (iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

/** "03/2027" → "2027-03" (what the route takes); "" → null; anything else → undefined (invalid). */
export function monthFromInput(text: string): string | null | undefined {
  const t = text.trim();
  if (t === "") return null;
  const p = parseDue(t.replace(/^~/, ""));
  return p.month ? p.month.slice(0, 7) : undefined;
}

export type FormValues = { kind: MilestoneVersion["kind"]; role: MilestoneVersion["role"]; title: string; curriculumId: string | null; afterUnit: string | null; month: string; approx: boolean };

export const valuesOf = (v: MilestoneVersion | Proposal): FormValues => ({
  kind: v.kind, role: v.role, title: v.title, curriculumId: v.curriculumId, afterUnit: v.afterUnit, month: monthInput(v.targetMonth), approx: v.approx,
});

export function fieldsOf(f: FormValues): MilestoneFields | null {
  const month = monthFromInput(f.month);
  if (month === undefined) return null;
  return {
    kind: f.kind, role: f.role, title: f.title.trim(), curriculum_id: f.role === "flag" && f.afterUnit ? f.curriculumId : null,
    after_unit: f.role === "flag" ? f.afterUnit : null, target_month: month, approx: month !== null && f.approx,
  };
}

/** "Sau U4 · Unit 4" for a milestone, or why it has no place on the mountain. */
export function placeLine(v: Pick<MilestoneVersion, "curriculumId" | "afterUnit">, curricula: readonly RoadmapCurriculum[]): string {
  if (!v.afterUnit) return roadmapCopy.row.noUnit;
  const unit = curricula.find((c) => c.id === v.curriculumId)?.units.find((u) => u.code === v.afterUnit);
  return unit ? roadmapCopy.row.after(unit.code, unit.title) : roadmapCopy.row.afterGone(v.afterUnit);
}

export const dateOf = (iso: string): string => formatDateVi(iso.slice(0, 10));
