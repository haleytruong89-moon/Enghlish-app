/**
 * Allowlist parsers for what the student routes return. The database functions already leave out keys, results,
 * transcripts and notes; these schemas STRIP anything else (zod object = unknown keys dropped), so a future column
 * can never reach a student by accident. A shape the database did not promise throws → 500, never a partial leak.
 */
import { z } from "zod";
import { ASSISTANCE_VALUES, PROVENANCE_VALUES, type ActivityView, type DraftReceipt, type HomeView, type Receipt, type SourceView } from "./types";

const mode = z.enum(["PRACTICE", "INDEPENDENT_CHECK", "REVISION"]);
const text = z.string();
const nullableText = z.string().nullable().optional().transform((v) => v ?? null);

const homeSchema = z.object({
  inquiries: z.array(
    z.object({
      instance_id: z.string(),
      title_vi: text,
      big_question_en: text,
      big_question_vi: text,
      due_on: text,
      steps: z.array(
        z.object({
          activity_id: z.string(),
          step_no: z.number().int(),
          activity_type: text,
          mode,
          purpose: z.array(text),
          time_min: z.number().int().nullable().optional().transform((v) => v ?? null),
          date: text,
          attempts: z.number().int(),
        }),
      ),
    }),
  ),
});

export function toHomeView(raw: unknown): HomeView {
  // the database returns null (not []) when the student has nothing released
  const parsed = homeSchema.parse(raw ?? { inquiries: [] });
  return {
    inquiries: parsed.inquiries.map((q) => ({
      instanceId: q.instance_id,
      titleVi: q.title_vi,
      bigQuestionEn: q.big_question_en,
      bigQuestionVi: q.big_question_vi,
      dueOn: q.due_on,
      steps: q.steps.map((s) => ({
        activityId: s.activity_id,
        stepNo: s.step_no,
        activityType: s.activity_type,
        mode: s.mode,
        purpose: s.purpose.filter((p) => p === "delayed_check" || p === "transfer_check"),
        timeMin: s.time_min,
        date: s.date,
        attempts: s.attempts,
      })),
    })),
  };
}

const draftContent = z.object({
  text: z.string().optional(),
  answers: z.record(z.string(), z.string()).optional(),
  pasted: z.boolean().optional(),
  assistance: z.array(z.enum(ASSISTANCE_VALUES)).optional(),
});

const supportedActivitySchema = z.object({
  supported: z.literal(true),
  activity_id: z.string(),
  instance_id: z.string(),
  step_no: z.number().int(),
  activity_type: text,
  mode,
  purpose: z.array(text),
  date: text,
  title_vi: text,
  big_question_en: text,
  big_question_vi: text,
  shape: z.enum(["text", "answers"]),
  can_submit: z.boolean(),
  step: z.object({
    prompt_en: text,
    time_min: z.number().int().nullable().optional().transform((v) => v ?? null),
    self_check_vi: z.array(text),
    items: z.array(
      z.object({
        id: text,
        kind: z.enum(["mcq", "gap", "word_form", "transform", "short", "open"]),
        stem: text,
        options: z.array(text),
      }),
    ),
  }),
  attempts: z.array(z.object({ attempt_no: z.number().int(), submitted_at: text, provenance: z.enum(PROVENANCE_VALUES) })),
  draft: z
    .object({ content: draftContent, revision: z.number().int(), updated_at: text })
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});

// An unsupported step is parsed with a schema that has NO place for a prompt, items or sources: even if the database
// ever returned them they would be stripped here.
const unsupportedActivitySchema = z.object({
  supported: z.literal(false),
  activity_id: z.string(),
  instance_id: z.string(),
  step_no: z.number().int(),
  activity_type: text,
  mode,
  date: text,
  title_vi: text,
  status_label_key: z.enum(["with_tutor", "on_paper"]),
});

const activitySchema = z.discriminatedUnion("supported", [supportedActivitySchema, unsupportedActivitySchema]);

const sourcesSchema = z.array(
  z.object({
    id: text,
    title: text,
    author: nullableText,
    rights_note: nullableText,
    modality: z.enum(["text", "audio", "video"]),
    url: nullableText,
    text: nullableText,
  }),
);

export function toSourceViews(raw: unknown): SourceView[] {
  // A step that is not supported in the app gets an object (status label only) from the database, never sources.
  if (!Array.isArray(raw)) return [];
  return sourcesSchema.parse(raw).map((s) => ({
    id: s.id,
    title: s.title,
    author: s.author,
    rightsNote: s.rights_note,
    modality: s.modality,
    url: s.url,
    // only reading texts carry text; an audio / video source is a link, never a transcript
    text: s.modality === "text" ? s.text : null,
  }));
}

export function toActivityView(rawActivity: unknown, rawSources: unknown): ActivityView {
  const a = activitySchema.parse(rawActivity);
  if (!a.supported) {
    return {
      supported: false,
      activityId: a.activity_id,
      instanceId: a.instance_id,
      stepNo: a.step_no,
      activityType: a.activity_type,
      mode: a.mode,
      date: a.date,
      titleVi: a.title_vi,
      statusLabelKey: a.status_label_key,
    };
  }
  return {
    supported: true,
    activityId: a.activity_id,
    instanceId: a.instance_id,
    stepNo: a.step_no,
    activityType: a.activity_type,
    mode: a.mode,
    purpose: a.purpose.filter((p) => p === "delayed_check" || p === "transfer_check"),
    date: a.date,
    titleVi: a.title_vi,
    bigQuestionEn: a.big_question_en,
    bigQuestionVi: a.big_question_vi,
    shape: a.shape,
    canSubmit: a.can_submit,
    step: {
      promptEn: a.step.prompt_en,
      timeMin: a.step.time_min,
      selfCheckVi: a.step.self_check_vi,
      items: a.step.items,
    },
    attempts: a.attempts.map((t) => ({ attemptNo: t.attempt_no, submittedAt: t.submitted_at, provenance: t.provenance })),
    draft: a.draft ? { content: a.draft.content, revision: a.draft.revision, updatedAt: a.draft.updated_at } : null,
    sources: toSourceViews(rawSources),
  };
}

const receiptSchema = z.object({
  attempt_id: z.string(),
  attempt_no: z.number().int(),
  submitted_at: text,
  hash: text,
  replayed: z.boolean(),
});

export function toReceipt(raw: unknown): Receipt {
  const r = receiptSchema.parse(raw);
  return { attemptId: r.attempt_id, attemptNo: r.attempt_no, submittedAt: r.submitted_at, hash: r.hash, replayed: r.replayed };
}

const draftReceiptSchema = z.object({ revision: z.number().int(), saved_at: text, other_tab_changed: z.boolean() });

export function toDraftReceipt(raw: unknown): DraftReceipt {
  const r = draftReceiptSchema.parse(raw);
  return { revision: r.revision, savedAt: r.saved_at, otherTabChanged: r.other_tab_changed };
}
