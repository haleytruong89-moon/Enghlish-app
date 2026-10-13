/** Request bodies for the S2 routes (zod). Parsed AFTER requireAccess, so outsiders always get 404. */
import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "not a calendar date");

export const assignBodySchema = z.strictObject({
  template_id: z.string().regex(/^[AB]-W[0-9]+-[A-Z0-9-]+$/),
  version: z.number().int().positive(),
  due_on: isoDate,
  client_request_id: z.string().min(8).max(100),
});
export type AssignBody = z.infer<typeof assignBodySchema>;

export const eventBodySchema = z
  .strictObject({
    kind: z.enum(["reschedule", "skip", "unskip"]),
    new_date: isoDate.optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .refine((b) => (b.kind === "reschedule") === (b.new_date !== undefined), {
    message: "reschedule needs new_date; skip and unskip must not have one",
    path: ["new_date"],
  });
export type EventBody = z.infer<typeof eventBodySchema>;
