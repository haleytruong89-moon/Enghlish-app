/** Request bodies of the W1 routes (zod). Parsed AFTER the access check, so outsiders always get 404. */
import { z } from "zod";
import { DOMAIN_KEYS } from "@/lib/skillmap/types";
import { FEEDBACK_KINDS, FEEDBACK_REPLY_MAX, FEEDBACK_SCREEN_MAX, FEEDBACK_STATUSES, FEEDBACK_TEXT_MAX, INTAKE_GOALS_MAX, INTAKE_TEXT_MAX, NOTE_FIELDS, NOTE_MAX } from "./types";

/** Same 8..90 as the app_feedback check in migration 0025 (the "new" event id adds a short suffix). */
const clientId = z.string().trim().min(8).max(90);

export const teachingNoteBodySchema = z.strictObject({
  field: z.enum(NOTE_FIELDS),
  /** An empty text clears the field (a new row; the old one stays in the log). */
  text: z.string().max(NOTE_MAX),
  client_id: clientId,
});
export type TeachingNoteBody = z.infer<typeof teachingNoteBodySchema>;

const byDomain = z.partialRecord(z.enum(DOMAIN_KEYS), z.string().trim().max(INTAKE_TEXT_MAX));

export const intakeBodySchema = z.strictObject({
  goals: z.array(z.strictObject({ title: z.string().trim().min(1).max(INTAKE_TEXT_MAX), due: z.string().trim().max(20).nullable() })).max(INTAKE_GOALS_MAX),
  strengths: byDomain,
  weaknesses: byDomain,
  note: z.string().trim().max(INTAKE_TEXT_MAX * 2),
  client_id: clientId,
});
export type IntakeBody = z.infer<typeof intakeBodySchema>;

export const appFeedbackBodySchema = z.strictObject({
  kind: z.enum(FEEDBACK_KINDS),
  screen: z.string().trim().min(1).max(FEEDBACK_SCREEN_MAX),
  text: z.string().trim().min(1).max(FEEDBACK_TEXT_MAX),
  client_id: clientId,
});
export type AppFeedbackBody = z.infer<typeof appFeedbackBodySchema>;

export const feedbackUpdateBodySchema = z.strictObject({
  status: z.enum(FEEDBACK_STATUSES),
  reply: z.string().max(FEEDBACK_REPLY_MAX).optional(),
  client_id: clientId,
});
export type FeedbackUpdateBody = z.infer<typeof feedbackUpdateBodySchema>;
