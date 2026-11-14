/** Request bodies of the 3B session routes (zod). Parsed AFTER requireAccess, so outsiders always get 404. The browser never sends a count. */
import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "not a calendar date");
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const clientId = z.string().min(8).max(100);

export const REQUESTED_BY = ["student", "tutor", "other"] as const;
export const SESSION_KINDS = ["regular", "makeup", "not_counted"] as const;

export const absenceBodySchema = z.strictObject({
  client_id: clientId,
  absent_on: isoDate,
  requested_by: z.enum(REQUESTED_BY),
  billable: z.boolean(),
  note: z.string().trim().max(300).optional(),
});
export type AbsenceBody = z.infer<typeof absenceBodySchema>;

export const cancelAbsenceBodySchema = z.strictObject({
  client_id: clientId,
  reason: z.string().trim().min(5).max(300),
});
export type CancelAbsenceBody = z.infer<typeof cancelAbsenceBodySchema>;

export const markBodySchema = z
  .strictObject({
    client_id: clientId,
    note_id: uuid,
    kind: z.enum(SESSION_KINDS),
    makeup_for: uuid.optional(),
    reason: z.string().trim().max(300).optional(),
  })
  .refine((b) => b.kind !== "not_counted" || (b.reason ?? "").length >= 5, { message: "reason needed", path: ["reason"] })
  .refine((b) => b.makeup_for === undefined || b.kind === "makeup", { message: "makeup_for needs kind makeup", path: ["makeup_for"] });
export type MarkBody = z.infer<typeof markBodySchema>;
