/** Request bodies for the S5b-1 routes (zod). Parsed AFTER requireAccess, so outsiders always get 404. */
import { z } from "zod";
import {
  MAX_WEAK_TAGS_PER_NOTE,
  MAX_WRITING_TAGS,
  MESSAGE_MAX,
  PARENT_NOTE_MAX,
  RECHECK_RESULTS,
  RESULT_ATTEMPTS,
  RESULT_CONTEXTS,
  RESULT_MODES,
  RESULT_SOURCES,
  STUDIED_MAX,
} from "./types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "not a calendar date");

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const clientId = z.string().min(8).max(100);
const tagKey = z.string().trim().min(1).max(61);
const itemNo = z.number().int().min(1).max(500);

export const resultBodySchema = z
  .strictObject({
    client_id: clientId,
    mode: z.enum(RESULT_MODES),
    /** Quick results only: counts as a test or as a practice (default practice). A framed result is always a test. */
    source: z.enum(RESULT_SOURCES).optional(),
    frame_id: uuid.optional(),
    title: z.string().trim().max(200).optional(),
    total_items: z.number().int().min(1).max(500).optional(),
    correct: z.number().int().min(0).max(500).optional(),
    wrong_items: z.array(itemNo).max(500),
    tags: z
      .array(z.strictObject({ n: itemNo, tag_key: tagKey.nullable() }))
      .max(500)
      .default([]),
    context: z.enum(RESULT_CONTEXTS),
    attempt: z.enum(RESULT_ATTEMPTS),
    used_hint: z.boolean(),
    taken_on: isoDate,
    supersedes_id: uuid.optional(),
    /** The assignment (link / PDF given in the app) this result is about; the database checks it is the same learner's. */
    assignment_id: uuid.optional(),
  })
  .refine((b) => (b.mode === "frame" ? Boolean(b.frame_id) && b.tags.length === 0 && (b.source === undefined || b.source === "test") : !b.frame_id), {
    message: "a framed result has a frame and takes its tags from it; a quick result has none",
    path: ["mode"],
  });
export type ResultBody = z.infer<typeof resultBodySchema>;

export const tagItemsBodySchema = z.strictObject({
  items: z
    .array(z.strictObject({ n: itemNo, tag_key: tagKey }))
    .min(1)
    .max(200),
});
export type TagItemsBody = z.infer<typeof tagItemsBodySchema>;

export const addTagBodySchema = z.strictObject({
  label: z.string().trim().min(2).max(120),
});
export type AddTagBody = z.infer<typeof addTagBodySchema>;

export const writingTagsBodySchema = z.strictObject({
  tags: z.array(tagKey).min(1).max(MAX_WRITING_TAGS),
});
export type WritingTagsBody = z.infer<typeof writingTagsBodySchema>;

export const sessionNoteBodySchema = z.strictObject({
  client_id: clientId,
  session_date: isoDate,
  studied: z.string().trim().max(STUDIED_MAX).optional(),
  weak_tags: z.array(tagKey).max(MAX_WEAK_TAGS_PER_NOTE).default([]),
  message: z.string().trim().max(MESSAGE_MAX).optional(),
  note_for_parent: z.string().trim().max(PARENT_NOTE_MAX).optional(),
  rechecks: z
    .array(z.strictObject({ tag_key: tagKey, result: z.enum(RECHECK_RESULTS) }))
    .max(30)
    .default([])
    .refine((r) => new Set(r.map((x) => x.tag_key)).size === r.length, {
      message: "each tag once",
    }),
  supersedes_id: uuid.optional(),
});
export type SessionNoteBody = z.infer<typeof sessionNoteBodySchema>;

/** Query of GET weak points: ?weeks=4|8|all. */
export const WEAK_WINDOWS = ["4", "8", "all"] as const;
export type WeakWindow = (typeof WEAK_WINDOWS)[number];
