/**
 * zod schemas for the versioned configuration files in /content (S1).
 * These describe what the code relies on; unknown extra fields are kept (loose objects)
 * because every catalogue row is also stored whole in a `raw jsonb` column.
 */
import { z } from "zod";

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

export const assessmentPolicySchema = z.strictObject({
  independent: z.strictObject({
    minFirstAttemptEpisodes: count,
    distinctDays: z.boolean(),
    minContexts: count,
    minSpanDays: count,
    minScoreEach: z.number().int().min(0).max(4),
    requireValidated: z.boolean(),
    minDirectCheckpoint: count,
    allowedModes: z.array(z.enum(["PRACTICE", "INDEPENDENT_CHECK", "REVISION"])).min(1),
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
