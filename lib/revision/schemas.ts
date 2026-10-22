/** Request bodies of the S6 routes (zod, strict: unknown keys are a 400). The database checks every rule again. */
import { z } from "zod";
import { UUID_RE } from "@/lib/work/schemas";
import { ASSISTANCE_VALUES, PROVENANCE_VALUES } from "@/lib/work/types";
import { CLOSING_MAX, EXCERPT_MAX, ITEM_MAX, MARK_CHOICES, MAX_ITEMS, PRAISE_MAX, REASON_MAX, VERDICTS } from "./types";

const clientId = z.string().min(8).max(100).refine((s) => s.trim().length >= 8, "client id");
const leaf = z.strictObject({ kind: z.enum(["tag", "target"]), ref_key: z.string().min(1).max(100) });
const item = z.strictObject({
  text: z.string().trim().min(1).max(ITEM_MAX),
  excerpt: z.string().trim().max(EXCERPT_MAX).optional(),
  leaf: leaf.nullable().optional(),
});
const praise = z.string().trim().min(1).max(PRAISE_MAX);
const items = z.array(item).min(1).max(MAX_ITEMS);

export const feedbackBodySchema = z.strictObject({
  client_id: clientId,
  praise,
  items,
  requires_revision: z.boolean(),
  supersedes_id: z.string().regex(UUID_RE).optional(),
});
export type FeedbackBody = z.infer<typeof feedbackBodySchema>;

const checks = z.array(z.strictObject({ n: z.number().int().min(1).max(MAX_ITEMS), verdict: z.enum(VERDICTS) })).min(1).max(MAX_ITEMS);
export const finishBodySchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("close"), client_id: clientId, checks, closing_note: z.string().trim().max(CLOSING_MAX).optional() }),
  z.strictObject({ action: z.literal("round2"), client_id: clientId, checks, praise, items }),
]);
export type FinishBody = z.infer<typeof finishBodySchema>;

const markKey = z.string().regex(/^[1-3]$/);
export const revisionDraftBodySchema = z.strictObject({
  content: z.strictObject({
    text: z.string().max(20000).optional(),
    marks: z.record(markKey, z.strictObject({ choice: z.enum(MARK_CHOICES).optional(), reason: z.string().max(REASON_MAX).optional() })).optional(),
    pasted: z.boolean().optional(),
    assistance: z.array(z.enum(ASSISTANCE_VALUES)).max(5).optional(),
  }),
  base_revision: z.number().int().min(0).max(1_000_000).optional(),
});
export type RevisionDraftBody = z.infer<typeof revisionDraftBodySchema>;

export const revisionSubmitBodySchema = z.strictObject({
  client_submission_id: z.string().regex(UUID_RE),
  /** The feedback the child was answering (S2): refused when it is no longer the live one. */
  feedback_id: z.string().regex(UUID_RE),
  text: z.string().min(1).max(20000),
  marks: z.record(markKey, z.strictObject({ choice: z.enum(MARK_CHOICES), reason: z.string().max(REASON_MAX).optional() })),
  assistance: z
    .array(z.enum(ASSISTANCE_VALUES))
    .min(1)
    .max(5)
    .refine((a) => !a.includes("none") || a.length === 1, "\"none\" cannot be combined with other help"),
  provenance: z.enum(PROVENANCE_VALUES),
});
export type RevisionSubmitBody = z.infer<typeof revisionSubmitBodySchema>;
