/**
 * Curriculum draft payload (stored in curriculum_versions.payload), the lenient shape of the AI tool output, and the request bodies.
 * Pure (zod). The strict schema guards what is STORED; lib/curriculum/normalize.ts turns the AI output into a strict payload.
 */
import { z } from "zod";
import { FILE_ID_RE } from "@/lib/storage/rules";
import { CURRICULUM_LIMITS as L, EDIT_REASONS, IGNORED_REASONS, QUALITY, UNIT_CODE_RE, UNIT_FLAGS, UNIT_ORIGINS, UNIT_STATUSES } from "./types";

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const tagKey = z.string().min(1).max(80);

export const unitDraftSchema = z.strictObject({
  code: z.string().regex(UNIT_CODE_RE),
  title: trimmed(L.unitTitle),
  section: z.string().trim().min(1).max(L.section).nullable(),
  page: z.number().int().min(1).max(L.page).nullable(),
  skipped: z.boolean(),
  points: z.array(tagKey).max(L.points),
  /** Points the AI thought of that are not in the list (free text): a hint to add a family tag, never stored as a link. */
  missing_points: z.array(trimmed(L.missingText)).max(L.missing),
  needs_review: z.boolean(),
  review_reason: z.string().trim().max(L.reason).nullable(),
  flags: z.array(z.enum(UNIT_FLAGS)).max(UNIT_FLAGS.length),
  origin: z.enum(UNIT_ORIGINS),
  /** Position in the AI draft (ai_payload.units), so the edit count survives a changed code. null for rows not from the AI. */
  ai_index: z.number().int().min(0).max(L.units).nullable(),
  /** "Bỏ": the row stays in the draft (for the edit count) but is not part of the approved version. */
  dropped: z.boolean(),
  edit_reason: z.enum(EDIT_REASONS).nullable(),
});
export type UnitDraft = z.infer<typeof unitDraftSchema>;

export const ignoredRowSchema = z.strictObject({
  label: trimmed(L.ignoredLabel),
  page: z.number().int().min(1).max(L.page).nullable(),
  reason: z.enum(IGNORED_REASONS),
  /** Set when the tutor moved an AI row here: its position in ai_payload.units, so "Đưa về Unit" / "Lấy lại dòng" find the same row. */
  from_ai_index: z.number().int().min(0).max(L.units).optional(),
});
export type IgnoredRow = z.infer<typeof ignoredRowSchema>;

export const curriculumPayloadSchema = z.strictObject({
  units: z.array(unitDraftSchema).max(L.units),
  ignored: z.array(ignoredRowSchema).max(L.ignored),
});
export type CurriculumPayload = z.infer<typeof curriculumPayloadSchema>;

export const EMPTY_PAYLOAD: CurriculumPayload = { units: [], ignored: [] };

/** What the model sent through the tool `save_curriculum_toc` (lenient: unknown keys dropped, numbers as text or numbers). */
export const aiTocSchema = z.object({
  units: z
    .array(
      z.object({
        number: z.union([z.string(), z.number()]).transform((v) => String(v)),
        title: z.string(),
        section: z.string().nullable().optional(),
        page: z.number().int().nullable().optional(),
        points: z.array(z.string()).default([]),
        missing_points: z.array(z.string()).default([]),
        needs_review: z.boolean().default(false),
        review_reason: z.string().nullable().optional(),
      }),
    )
    .max(L.units),
  ignored: z.array(z.object({ label: z.string(), page: z.number().int().nullable().optional(), reason: z.string() })).default([]),
});
export type AiToc = z.infer<typeof aiTocSchema>;

// ---- Request bodies (strict) ----------------------------------------------------------------------------------------------------
const clientId = z.string().trim().min(8).max(100);
const base = z.string().min(10).max(64);
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const fileMetaSchema = z.strictObject({ id: z.string().regex(FILE_ID_RE), mime: z.string().max(200), bytes: z.number().int() });
export type FileMeta = z.infer<typeof fileMetaSchema>;

export const tocUploadBodySchema = z.strictObject({ mime: z.string().max(200), bytes: z.number().int() });
export const createCurriculumBodySchema = z.strictObject({
  title: trimmed(L.title),
  level_note: z.string().trim().max(L.levelNote).nullable(),
  mode: z.enum(["ai", "manual"]),
  toc_file: fileMetaSchema.nullable(),
  client_id: clientId,
});
/** "Nạp mục lục" for a curriculum that already exists (a new version). */
export const addVersionBodySchema = z.strictObject({ mode: z.enum(["ai", "manual"]), toc_file: fileMetaSchema.nullable(), client_id: clientId });
export const saveCurriculumBodySchema = z.strictObject({ payload: curriculumPayloadSchema, base_updated_at: base });
export const approveCurriculumBodySchema = z.strictObject({
  base_updated_at: base,
  quality: z.enum(QUALITY).nullable(),
  quality_note: z.string().trim().max(L.qualityNote).nullable(),
});
export const editCurriculumBodySchema = z.strictObject({ client_id: clientId });
export const unitStatusBodySchema = z.strictObject({
  unit_code: z.string().regex(UNIT_CODE_RE),
  status: z.enum(UNIT_STATUSES),
  lesson_note_id: uuid.nullable(),
  client_id: clientId,
});
export const taughtUnitSchema = z.strictObject({ curriculum_id: uuid, unit_code: z.string().regex(UNIT_CODE_RE) });
export type TaughtUnit = z.infer<typeof taughtUnitSchema>;
/** "Unit đã dạy hôm nay" on the session note: at most 6, each (curriculum, unit) once. */
export const taughtUnitsSchema = z
  .array(taughtUnitSchema)
  .max(L.taughtPerNote)
  .default([])
  .refine((xs) => new Set(xs.map((x) => `${x.curriculum_id}/${x.unit_code}`)).size === xs.length, { message: "each unit once" });
