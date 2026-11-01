/**
 * zod schemas for the versioned configuration files in /content (S1).
 * These describe what the code relies on; unknown extra fields are kept (loose objects)
 * because every catalogue row is also stored whole in a `raw jsonb` column.
 */
import { z } from "zod";
import { DOMAIN_KEYS } from "../skillmap/types";

export const TRACK_IDS = ["A", "B"] as const;
export const trackIdSchema = z.enum(TRACK_IDS);
export type TrackId = z.infer<typeof trackIdSchema>;

const nonEmpty = z.string().trim().min(1);

// ---------- Catalogue -------------------------------------------------------------------
export const activityTypeSchema = z.looseObject({ id: nonEmpty, desc: z.string() });

export const catalogueMetaSchema = z.looseObject({
  version: nonEmpty,
  descriptor_version: nonEmpty,
  assessment_policy_version: nonEmpty,
  target_key: z.looseObject({ fields: z.array(nonEmpty).min(1) }),
  activity_types: z.looseObject({ items: z.array(activityTypeSchema).min(1) }),
});

export const dimensionGroupSchema = z.enum(["language", "thinking", "autonomy", "extension"]);

export const dimensionSchema = z.looseObject({
  id: nonEmpty,
  group: dimensionGroupSchema,
  name_en: nonEmpty,
  name_vi: nonEmpty,
  ai_scorable: z.boolean(),
  cefr_applicable: z.boolean(),
  extension: z.boolean(),
  tracks: z.array(trackIdSchema).min(1),
  rubric_0_4: z.record(z.string(), z.string()),
  rubric_0_4_vi: z.record(z.string(), z.string()),
});
export type Dimension = z.infer<typeof dimensionSchema>;

export const OUTPUT_MODALITIES = ["writing", "speaking", "any"] as const;
export const INPUT_MODALITIES = ["reading", "listening", "source_any"] as const;

export const successCriterionSchema = z.looseObject({
  id: nonEmpty,
  check: nonEmpty,
  check_vi: nonEmpty,
  method: nonEmpty,
  computable: z.boolean(),
});

export const targetSchema = z.looseObject({
  id: nonEmpty,
  track: trackIdSchema,
  dimension_id: nonEmpty,
  title_en: nonEmpty,
  title_vi: nonEmpty,
  can_do: nonEmpty,
  target_demand: nonEmpty,
  input_modality: z.enum(INPUT_MODALITIES).nullable(),
  output_modality: z.enum(OUTPUT_MODALITIES),
  success_criteria: z.array(successCriterionSchema).min(1),
  opportunity_rule: nonEmpty,
  ai_may_propose: z.boolean(),
  core: z.boolean(),
  status: z.enum(["active", "draft", "retired"]),
});
export type Target = z.infer<typeof targetSchema>;

export const aggregateIndicatorSchema = z.looseObject({
  id: nonEmpty,
  track: trackIdSchema,
  dimension_id: nonEmpty.nullable(),
  definition: nonEmpty,
  definition_vi: nonEmpty,
  use: z.literal("diagnostic_only"),
  /** Aggregates are never mastery gates (decision 4 of the S1 plan). */
  mastery_gate: z.literal(false),
});
export type AggregateIndicator = z.infer<typeof aggregateIndicatorSchema>;

export const catalogueSchema = z
  .looseObject({
    meta: catalogueMetaSchema,
    dimensions: z.array(dimensionSchema).min(1),
    targets: z.array(targetSchema).min(1),
    aggregate_indicators: z.array(aggregateIndicatorSchema),
  })
  .superRefine((cat, ctx) => {
    const dimIds = new Set(cat.dimensions.map((d) => d.id));
    const seen = new Set<string>();
    for (const t of cat.targets) {
      if (seen.has(t.id)) ctx.addIssue({ code: "custom", message: `duplicate target id ${t.id}` });
      seen.add(t.id);
      if (!dimIds.has(t.dimension_id)) {
        ctx.addIssue({ code: "custom", message: `target ${t.id}: unknown dimension ${t.dimension_id}` });
      }
    }
    for (const a of cat.aggregate_indicators) {
      if (seen.has(a.id)) ctx.addIssue({ code: "custom", message: `aggregate id clashes with a target: ${a.id}` });
      seen.add(a.id);
      if (a.dimension_id !== null && !dimIds.has(a.dimension_id)) {
        ctx.addIssue({ code: "custom", message: `aggregate ${a.id}: unknown dimension ${a.dimension_id}` });
      }
    }
  });
export type Catalogue = z.infer<typeof catalogueSchema>;

// ---------- Assessment policy (DESIGN §8) --------------------------------------------------
const count = z.number().int().nonnegative();
const pct = z.number().int().min(0).max(100);
const policyMode = z.enum(["PRACTICE", "INDEPENDENT_CHECK", "REVISION"]);

/**
 * P3-b (skill-map spec 2026-10-21; S7a route 2): "Tự làm được" from auto-checked closed items done in the app, for skills whose
 * skill-map domain is listed. `developingMinItems` / `developingMinAccuracyPct` (S7a amendment G2) let the same items lift a skill
 * to level 2 before route 2 is complete. First seen in AP-0.3; older policies have no such block (route 2 is then off).
 */
export const receptiveAutoSchema = z.strictObject({
  domains: z.array(z.enum(DOMAIN_KEYS)).min(1),
  minItems: count,
  minActivities: count,
  minAccuracyPct: pct,
  developingMinItems: count,
  developingMinAccuracyPct: pct,
  reviewMinDays: count,
  reviewMinAccuracyPct: pct,
  /** N1: a counted quiz below `minAccuracyPct` raises ⚑ only when it has at least this many counted items of the skill. */
  flagMinItems: count,
  firstAttemptOnly: z.boolean(),
  allowedModes: z.array(policyMode).min(1),
  maxAssistanceAffectingTarget: count,
});
export type ReceptiveAuto = z.infer<typeof receptiveAutoSchema>;

export const assessmentPolicySchema = z.strictObject({
  independent: z.strictObject({
    minFirstAttemptEpisodes: count,
    distinctDays: z.boolean(),
    minContexts: count,
    minSpanDays: count,
    minScoreEach: z.number().int().min(0).max(4),
    requireValidated: z.boolean(),
    minDirectCheckpoint: count,
    allowedModes: z.array(policyMode).min(1),
    maxAssistanceAffectingTarget: count,
  }),
  transferable: z.strictObject({
    requires: z.literal("INDEPENDENT"),
    minDistinctEpisodes: count,
    needs: z.array(z.enum(["delayed_check", "transfer_check"])).min(1),
    delayedMinDaysFromLastExposure: count,
    transferNeedsTutorDescribedDifference: z.boolean(),
  }),
  supported: z.strictObject({ minScore: z.number().int().min(0).max(4), assistanceAllowed: z.boolean() }),
  developing: z.strictObject({ minScore: z.number().int().min(0).max(4) }),
  conflictWindowDays: count,
  revisionNeverFirstAttempt: z.boolean(),
  receptiveAuto: receptiveAutoSchema.optional(),
  /** Reserved for S7b (domain level-up gate, P3-a). Must stay null until a policy version defines it. */
  levelGate: z.null().optional(),
});
export type AssessmentPolicy = z.infer<typeof assessmentPolicySchema>;

// ---------- Target sets (PRD §3.1, §3.2) ----------------------------------------------------
export const targetSetDefinitionSchema = z.strictObject({
  id: nonEmpty,
  track: trackIdSchema,
  version: z.number().int().positive(),
  target_ids: z.array(nonEmpty).min(1),
  /** Shown to the tutor/parent but NOT part of the coverage denominator. */
  tracking_only: z.strictObject({
    dimensions: z.array(nonEmpty),
    aggregates: z.array(nonEmpty),
  }),
});
export type TargetSetDefinition = z.infer<typeof targetSetDefinitionSchema>;

export const targetSetsFileSchema = z.array(targetSetDefinitionSchema).min(1);

/** Canonical target key (catalogue meta.target_key). See lib/config/targetKey.ts. */
export type TargetKey = {
  competencyId: string;
  descriptorVersion: string;
  targetDemand: string;
  inputModality: Target["input_modality"];
  outputModality: Exclude<Target["output_modality"], "any">;
  assessmentPolicyVersion: string;
};

// ---------- Inquiry templates (S2; PRD §4, DESIGN §4) -----------------------------------------
export const ACTIVITY_TYPE_IDS = [
  "ACT-SOURCE-QA",
  "ACT-CANVAS-BASIC",
  "ACT-CANVAS-ADV",
  "ACT-SPEAK-MONO",
  "ACT-SPEAK-LIVE",
  "ACT-WRITE",
  "ACT-REVISE",
  "ACT-SELF-REVIEW",
] as const;
export const MODES = ["PRACTICE", "INDEPENDENT_CHECK", "REVISION"] as const;
export const STEP_PURPOSES = ["baseline", "checkpoint", "delayed_check", "transfer_check"] as const;
/** Closed items have exactly one expected answer (auto-checkable in S3); short/open items have a model answer. */
export const CLOSED_ITEM_KINDS = ["mcq", "gap", "word_form", "transform"] as const;
export const ITEM_KINDS = [...CLOSED_ITEM_KINDS, "short", "open"] as const;
export const SOURCE_MODALITIES = ["text", "audio", "video"] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), "not a calendar date");

export const inquiryItemSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9_.-]+$/, "item ids use letters, digits, . _ -"),
  kind: z.enum(ITEM_KINDS),
  stem: nonEmpty,
  options: z.array(nonEmpty),
  /** Expected answer or model answer. NEVER copied into the student-visible snapshot. */
  answer: z.string(),
  explanation_vi: z.string(),
  /** A target id or an aggregate-indicator id of the catalogue; null for pure diagnostics. */
  target_id: nonEmpty.nullable(),
});
export type InquiryItem = z.infer<typeof inquiryItemSchema>;

export const inquiryStepSchema = z.strictObject({
  step_no: z.number().int().positive(),
  activity_type: z.enum(ACTIVITY_TYPE_IDS),
  mode: z.enum(MODES),
  purpose: z.array(z.enum(STEP_PURPOSES)),
  target_ids: z.array(nonEmpty),
  prompt_en: nonEmpty,
  /** Tutor/parent script, schedule and hints (may contain answer hints) → staff-only, never in the snapshot. */
  prompt_vi: z.string(),
  time_min: z.number().int().nonnegative(),
  /** Default day for this step (already inside the week); staff can reschedule with a reason. */
  planned_date: isoDate.nullable(),
  items: z.array(inquiryItemSchema),
  self_check_vi: z.array(z.string()),
  /** `needs_review`: the content breaks a validation rule and waits for the parent's decision. */
  status: z.literal("needs_review").optional(),
  review_note: nonEmpty.optional(),
});
export type InquiryStep = z.infer<typeof inquiryStepSchema>;

export const inquirySourceSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9_.-]+$/),
  title: nonEmpty,
  /** External link. Video is link-only (O-F1 default): the app never embeds a player. */
  url: z
    .string()
    .regex(/^https?:\/\/\S+$/)
    .nullable(),
  author: nonEmpty,
  rights_note: nonEmpty,
  modality: z.enum(SOURCE_MODALITIES),
  /** text → the reading text; audio → the transcript (staff-only); video → must be empty. */
  text: z.string(),
});
export type InquirySource = z.infer<typeof inquirySourceSchema>;

export const inquiryTemplateSchema = z
  .strictObject({
    format: z.literal("inquiry-template/1"),
    id: z.string().regex(/^[AB]-W\d+-[A-Z0-9-]+$/, "id looks like A-W1-VOLCANOES"),
    version: z.number().int().positive(),
    track: trackIdSchema,
    status: z.enum(["draft", "published"]),
    catalogue_version: nonEmpty,
    title_vi: nonEmpty,
    big_question_en: nonEmpty,
    big_question_vi: nonEmpty,
    week: z.number().int().nonnegative(),
    dates: z.strictObject({ from: isoDate, to: isoDate }),
    domain_bucket: nonEmpty,
    target_ids: z.array(nonEmpty).min(1),
    sources: z.array(inquirySourceSchema),
    steps: z.array(inquiryStepSchema).min(1),
  })
  .superRefine((t, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (t.id[0] !== t.track) issue(`template ${t.id}: id prefix does not match track ${t.track}`);
    if (t.dates.to < t.dates.from) issue(`template ${t.id}: dates.to is before dates.from`);
    t.steps.forEach((s, i) => {
      if (s.step_no !== i + 1) issue(`template ${t.id}: step_no must run 1..n without gaps (got ${s.step_no} at position ${i + 1})`);
      if (s.status === "needs_review" && !s.review_note) issue(`template ${t.id} step ${s.step_no}: needs_review requires review_note`);
      if (t.id.endsWith("-BASELINE") && !s.purpose.includes("baseline")) {
        issue(`template ${t.id} step ${s.step_no}: baseline templates carry purpose "baseline" on every step`);
      }
    });
    if (t.status === "published" && t.steps.some((s) => s.status === "needs_review")) {
      issue(`template ${t.id}: a template with needs_review steps must stay draft`);
    }
    for (const s of t.sources) {
      if (s.modality === "video" && !s.url) issue(`source ${s.id}: a video source needs a link (link-only)`);
      if (s.modality === "video" && s.text.trim()) issue(`source ${s.id}: a video source carries no text`);
      if (s.modality !== "video" && !s.text.trim()) issue(`source ${s.id}: ${s.modality} source needs text/transcript`);
    }
  });
export type InquiryTemplate = z.infer<typeof inquiryTemplateSchema>;
