/**
 * Studio B1 draft payload (spec §4.4) and the lenient shape of the AI tool output (§5.3). Pure: used by the server, the browser
 * editor and the tests. The strict schema guards what is STORED in studio_drafts.payload; the AI schema only reads what the model sent
 * (unknown keys dropped, spike kind names accepted) and lib/studio/normalize.ts turns it into a strict draft.
 */
import { z } from "zod";

export const STUDIO_ITEM_KINDS = ["mcq", "gap", "word_form", "transform", "short", "open"] as const;
export type StudioItemKind = (typeof STUDIO_ITEM_KINDS)[number];
/** Closed items need a key from the tutor's answer file (spec §5.4). */
export const CLOSED_STUDIO_KINDS = ["mcq", "gap", "word_form", "transform", "short"] as const;
/** Checked by the app at once; transform / short may need a person when the answer is not in the key. */
export const AUTO_STUDIO_KINDS = ["mcq", "gap", "word_form"] as const;

export const STUDIO_LIMITS = {
  title: 160,
  parts: 30,
  partKey: 20,
  partName: 120,
  instructions: 1000,
  passages: 20,
  passageTitle: 200,
  passageText: 20000,
  items: 300,
  stem: 2000,
  options: 8,
  option: 300,
  key: 2000,
  accepted: 10,
  explanation: 300,
  reason: 300,
} as const;

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const studioPartSchema = z.strictObject({
  key: z.string().trim().regex(/^[A-Za-z0-9-]{1,20}$/),
  name: trimmed(STUDIO_LIMITS.partName),
  instructions: z.string().max(STUDIO_LIMITS.instructions),
});
export const studioPassageSchema = z.strictObject({
  ref: z.string().regex(/^[A-Za-z0-9]{1,10}$/),
  title: trimmed(STUDIO_LIMITS.passageTitle),
  text: trimmed(STUDIO_LIMITS.passageText),
});
export const studioOptionSchema = z.strictObject({
  letter: z.string().regex(/^[A-H]$/),
  text: trimmed(STUDIO_LIMITS.option),
});
export const studioItemSchema = z.strictObject({
  n: z.number().int().min(1).max(STUDIO_LIMITS.items),
  part: z.string().trim().regex(/^[A-Za-z0-9-]{1,20}$/),
  kind: z.enum(STUDIO_ITEM_KINDS),
  out_of_app: z.boolean(),
  stem: z.string().max(STUDIO_LIMITS.stem),
  options: z.array(studioOptionSchema).max(STUDIO_LIMITS.options),
  passage_ref: z.string().regex(/^[A-Za-z0-9]{1,10}$/).nullable(),
  key: z.string().max(STUDIO_LIMITS.key).nullable(),
  accepted: z.array(trimmed(STUDIO_LIMITS.key)).max(STUDIO_LIMITS.accepted),
  tag_key: z.string().min(1).max(80).nullable(),
  target_id: z.string().min(1).max(80).nullable(),
  reading_skill_key: z.string().min(1).max(80).nullable(),
  explanation_vi: z.string().max(STUDIO_LIMITS.explanation),
  needs_review: z.boolean(),
  review_reason: z.string().max(STUDIO_LIMITS.reason).nullable(),
});
export const studioDraftSchema = z.strictObject({
  parts: z.array(studioPartSchema).max(STUDIO_LIMITS.parts),
  passages: z.array(studioPassageSchema).max(STUDIO_LIMITS.passages),
  items: z.array(studioItemSchema).max(STUDIO_LIMITS.items),
});

export type StudioPart = z.infer<typeof studioPartSchema>;
export type StudioPassage = z.infer<typeof studioPassageSchema>;
export type StudioItem = z.infer<typeof studioItemSchema>;
export type StudioDraft = z.infer<typeof studioDraftSchema>;

export const EMPTY_DRAFT: StudioDraft = { parts: [], passages: [], items: [] };

// ---- What the AI sends (lenient; never stored as is) ----------------------------------------------------------------
const loose = z.string().catch("");
const looseNull = z.string().nullable().optional().catch(null);
export const aiExtractSchema = z.object({
  title: z.string().optional().catch(undefined),
  parts: z.array(z.object({ key: loose, name: loose, instructions: loose })).catch([]),
  passages: z.array(z.object({ ref: loose, title: loose, text: loose })).default([]).catch([]),
  items: z.array(
    z.object({
      n: z.number().int(),
      part: loose,
      kind: loose,
      out_of_app: z.boolean().optional().catch(false),
      stem: loose,
      options: z.array(z.object({ letter: loose, text: loose })).default([]).catch([]),
      passage_ref: looseNull,
      key: looseNull,
      accepted: z.array(z.string()).default([]).catch([]),
      tag_key: looseNull,
      target_id: looseNull,
      reading_skill_key: looseNull,
      explanation_vi: z.string().optional().catch(""),
      needs_review: z.boolean().optional().catch(false),
      review_reason: looseNull,
    }),
  ),
});
export type AiExtract = z.infer<typeof aiExtractSchema>;
