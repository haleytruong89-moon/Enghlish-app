/** Lenient shape of the AI tool output `save_read_answers` and the strict payload stored in import_batches.payload. Pure (zod). */
import { z } from "zod";
import { FILE_ID_RE } from "@/lib/storage/rules";
import { IMPORT_LIMITS as L, READ_CONFIDENCE, READ_RESULTS, SUPPORT_LEVELS } from "./types";

const answer = z.string().max(2000).nullable().optional();

export const aiReadSchema = z.object({
  questions: z
    .array(
      z.object({
        n: z.number().int().min(1).max(999),
        part: z.string().max(100).optional().default(""),
        student_answer: answer,
        key_answer: answer,
        tag: z.string().max(80).nullable().optional(),
        out_of_app: z.boolean().optional().default(false),
        confidence: z.enum(READ_CONFIDENCE).optional().default("low"),
      }),
    )
    .max(L.questions),
});
export type AiRead = z.infer<typeof aiReadSchema>;

export const readItemSchema = z.strictObject({
  n: z.number().int().min(1).max(999),
  part: z.string().max(L.part),
  student_answer: z.string().max(L.answer).nullable(),
  key_answer: z.string().max(L.answer).nullable(),
  tag: z.string().max(80).nullable(),
  out_of_app: z.boolean(),
  confidence: z.enum(READ_CONFIDENCE),
  result: z.enum(READ_RESULTS),
});
export const readPayloadSchema = z.strictObject({ items: z.array(readItemSchema).min(1).max(L.questions) });
/** What import_batches.payload may hold in ANY state: the column default is {"items": []} (reading / ai_failed / a manual draft before rows are added). */
export const batchPayloadSchema = z.strictObject({ items: z.array(readItemSchema).max(L.questions) });

// ---- Request bodies (parsed AFTER requireAccess) -----------------------------------------------------------------------------------
const clientId = z.string().min(8).max(100);
export const fileMetaSchema = z.strictObject({ id: z.string().regex(FILE_ID_RE), mime: z.string().max(200), bytes: z.number().int() });
export type FileMeta = z.infer<typeof fileMetaSchema>;

export const importUploadBodySchema = z.strictObject({ purpose: z.enum(["import_work", "import_key"]), mime: z.string().max(200), bytes: z.number().int() });
export const createImportBodySchema = z.strictObject({
  title: z.string().trim().min(1).max(L.title),
  work_file: fileMetaSchema,
  key_file: fileMetaSchema,
  taken_on: z.string().date(),
  support_level: z.enum(SUPPORT_LEVELS),
  source_hash: z.string().regex(/^[0-9a-f]{64}$/),
  allow_other: z.boolean().optional(),
  /** "Soạn tay": no AI; the tutor types the rows (AI off, no consent, over the cap, or after a failed read). */
  manual: z.boolean().optional(),
  client_id: clientId,
});
export const retryImportBodySchema = z.strictObject({ mode: z.enum(["retry", "manual"]) });

/** What the tutor confirms: the rows as seen on the review screen (a row with no tag, or still "Cần xem", cannot be confirmed). */
export const confirmRowSchema = z.strictObject({
  n: z.number().int().min(1).max(999),
  part: z.string().max(L.part),
  student_answer: z.string().max(L.answer).nullable(),
  key_answer: z.string().max(L.answer).nullable(),
  tag: z.string().min(1).max(80),
  out_of_app: z.boolean(),
  result: z.enum(["correct", "incorrect", "blank"]),
});
export const confirmImportBodySchema = z.strictObject({
  base_updated_at: z.string().min(1).max(60),
  rows: z.array(confirmRowSchema).min(1).max(L.questions),
  client_id: clientId,
});
export type ConfirmRow = z.infer<typeof confirmRowSchema>;
