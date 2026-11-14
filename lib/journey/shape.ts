/**
 * eng_my_roadmap (the child's read) → the input of buildJourney. Pure (zod). The function returns only what the child may see:
 * Units with their own status, other curricula as counts, and confirmed milestones. Anything else is dropped here as well (strict picks).
 */
import { z } from "zod";
import { MILESTONE_KINDS, MILESTONE_ROLES, type ChildMilestone } from "@/lib/roadmap/types";
import type { JourneyInput } from "./path";

const raw = z.object({
  main: z.object({ id: z.string(), title: z.string() }).nullable(),
  units: z.array(z.object({
    code: z.string(), ord: z.number().int(), title: z.string(), skipped: z.boolean(),
    status: z.enum(["done", "in_progress", "not_started", "skipped"]), done_on: z.string().nullable(),
  })),
  others: z.array(z.object({ id: z.string(), title: z.string(), done: z.number().int(), total: z.number().int() })),
  milestones: z.array(z.object({
    id: z.string(), kind: z.enum(MILESTONE_KINDS), role: z.enum(MILESTONE_ROLES), title: z.string(), curriculum_id: z.string().nullable(),
    after_unit: z.string().nullable(), target_month: z.string().nullable(), approx: z.boolean(),
  })),
});

export function parseMyRoadmap(input: unknown): JourneyInput {
  const r = raw.parse(input);
  return {
    main: r.main,
    units: r.units.map((u) => ({ code: u.code, ord: u.ord, title: u.title, skipped: u.skipped, status: u.status, doneOn: u.done_on })),
    others: r.others,
    milestones: r.milestones.map((m): ChildMilestone => ({
      id: m.id, kind: m.kind, role: m.role, title: m.title, curriculumId: m.curriculum_id, afterUnit: m.after_unit, targetMonth: m.target_month, approx: m.approx,
    })),
  };
}
