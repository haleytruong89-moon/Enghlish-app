/** Request bodies for the student work routes (zod, strict: unknown keys are a 400). */
import { z } from "zod";
import { ASSISTANCE_VALUES, PROVENANCE_VALUES } from "./types";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = z.string().regex(UUID_RE);

const answers = z
  .record(z.string().min(1).max(100), z.string().max(20000))
  .refine((r) => Object.keys(r).length <= 200, "too many answers");

const assistance = z.enum(ASSISTANCE_VALUES);

/** A draft may hold any mix of the editor's fields; the database checks them against the step. */
export const draftBodySchema = z.strictObject({
  content: z.strictObject({
    text: z.string().max(20000).optional(),
    answers: answers.optional(),
    pasted: z.boolean().optional(),
    assistance: z.array(assistance).max(5).optional(),
  }),
  base_revision: z.number().int().min(0).max(1_000_000).optional(),
});
export type DraftBody = z.infer<typeof draftBodySchema>;

export const attemptBodySchema = z.strictObject({
  activity_id: uuid,
  client_submission_id: uuid,
  content: z.union([z.strictObject({ text: z.string().min(1).max(20000) }), z.strictObject({ answers })]),
  assistance: z
    .array(assistance)
    .min(1)
    .max(5)
    .refine((a) => !a.includes("none") || a.length === 1, "\"none\" cannot be combined with other help"),
  provenance: z.enum(PROVENANCE_VALUES),
});
export type AttemptBody = z.infer<typeof attemptBodySchema>;
