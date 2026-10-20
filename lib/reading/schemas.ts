import { z } from "zod";
import { READING_MAX_ROWS, READING_NOTE_MAX, READING_SOURCE_MAX } from "./types";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const firstOfMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/);

export const readingReportBodySchema = z.strictObject({
  client_id: z.string().min(8).max(100),
  month: firstOfMonth,
  source: z.string().trim().min(1).max(READING_SOURCE_MAX).optional(),
  rows: z
    .array(z.strictObject({
      tag_key: z.string().trim().min(1).max(61),
      questions: z.number().int().min(1).max(500),
      correct_pct: z.number().int().min(0).max(100),
    }))
    .min(1)
    .max(READING_MAX_ROWS),
  note: z.string().trim().max(READING_NOTE_MAX).optional(),
  supersedes_id: uuid.optional(),
});
export type ReadingReportBody = z.infer<typeof readingReportBodySchema>;
