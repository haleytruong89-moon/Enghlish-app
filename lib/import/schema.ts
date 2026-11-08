/** Lenient shape of the AI tool output `save_read_answers` and the strict payload stored in import_batches.payload. Pure (zod). */
import { z } from "zod";
import { IMPORT_LIMITS as L, READ_CONFIDENCE, READ_RESULTS } from "./types";

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
