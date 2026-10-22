/** Request bodies of the SM-2 routes (zod). Parsed AFTER requireAccess, so outsiders always get 404. */
import { z } from "zod";
import { fileMetaSchema, isoDate, uuid } from "@/lib/practice/schemas";
import { CEFR_LEVELS, DOMAIN_KEYS } from "@/lib/skillmap/types";
import { TASK_LEVELS } from "./scale";
import { EXAMS, NOTE_MAX, REASON_MAX, SCORE_MAX } from "./types";

const clientId = z.string().min(8).max(100);
/** A level of either scale; the database checks it against the domain's own scale (bad_level). */
const level = z.enum([...CEFR_LEVELS, ...TASK_LEVELS]);

export const recordLevelsBodySchema = z
  .strictObject({
    client_id: clientId,
    kind: z.enum(["baseline", "adjust"]),
    levels: z.partialRecord(z.enum(DOMAIN_KEYS), level),
    reason: z.string().trim().max(REASON_MAX).optional(),
  })
  .refine(
    (b) => {
      const n = Object.keys(b.levels).length;
      return b.kind === "adjust" ? n === 1 && Boolean(b.reason) : n >= 1;
    },
    { message: "a baseline names 1 to 7 domains; an adjustment exactly one, with a reason", path: ["levels"] },
  );
export type RecordLevelsBody = z.infer<typeof recordLevelsBodySchema>;

export const externalResultBodySchema = z.strictObject({
  client_id: clientId,
  exam: z.enum(EXAMS),
  taken_on: isoDate,
  score_text: z.string().trim().min(1).max(SCORE_MAX),
  domains: z.array(z.enum(DOMAIN_KEYS)).min(1).max(7),
  note: z.string().trim().max(NOTE_MAX).optional(),
  file: fileMetaSchema.optional(),
  /** A2: this entry replaces an earlier one of the same child (a correction). */
  supersedes_id: uuid.optional(),
});
export type ExternalResultBody = z.infer<typeof externalResultBodySchema>;
