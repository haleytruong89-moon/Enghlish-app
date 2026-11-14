/** Request bodies of the W4a roadmap routes (zod, strict). Parsed AFTER requireAccess, so outsiders always get 404. */
import { z } from "zod";
import { MILESTONE_KINDS, MILESTONE_ROLES, MILESTONE_STATUSES, ROADMAP_LIMITS } from "./types";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const clientId = z.string().min(8).max(100);

export const milestoneFieldsSchema = z.strictObject({
  kind: z.enum(MILESTONE_KINDS),
  role: z.enum(MILESTONE_ROLES),
  title: z.string().trim().min(1).max(ROADMAP_LIMITS.title),
  curriculum_id: uuid.nullable().optional(),
  after_unit: z.string().regex(/^[A-Z0-9][A-Z0-9-]{0,19}$/).nullable().optional(),
  /** "YYYY-MM" (the form sends the month; the database stores the 1st). */
  target_month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).nullable().optional(),
  approx: z.boolean().optional(),
});
export type MilestoneFields = z.infer<typeof milestoneFieldsSchema>;

export const milestoneBodySchema = z
  .strictObject({
    client_id: clientId,
    milestone_id: uuid.optional(),
    base_version: z.number().int().min(1).max(999).optional(),
    /** Absent = keep the fields of the current version (confirm a draft as it is, remove). */
    fields: milestoneFieldsSchema.optional(),
    status: z.enum(MILESTONE_STATUSES),
    reason: z.string().trim().max(ROADMAP_LIMITS.reasonMax).optional(),
    proposal_key: z.string().regex(/^(pt|goal|track):[a-z0-9:_-]{1,140}$/).optional(),
  })
  .refine((b) => b.milestone_id !== undefined || b.fields !== undefined, { message: "a new milestone needs fields", path: ["fields"] })
  .refine((b) => (b.milestone_id === undefined) === (b.base_version === undefined), { message: "base_version goes with milestone_id", path: ["base_version"] })
  .refine((b) => b.status !== "removed" || (b.reason ?? "").length >= ROADMAP_LIMITS.reasonMin, { message: "reason needed", path: ["reason"] })
  .refine((b) => b.proposal_key === undefined || b.milestone_id === undefined, { message: "a proposal key belongs to a new milestone", path: ["proposal_key"] });
export type MilestoneBody = z.infer<typeof milestoneBodySchema>;

export const mainBodySchema = z.strictObject({ client_id: clientId, curriculum_id: uuid });
export type MainBody = z.infer<typeof mainBodySchema>;
