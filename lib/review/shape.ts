/**
 * Parse what the english.eng_review_* functions return (jsonb) into the typed views the pages use.
 * zod strips unknown keys, so nothing the page does not name can leak into it. Anything unexpected throws (→ 500, logged)
 * rather than showing a half-right score.
 */
import { z } from "zod";
import type { InboxItem, LessonNoteView, ReviewEpisodeView, ReviewTarget } from "./types";

const text = z.string();
const nullableText = z.string().nullable().optional().transform((v) => v ?? null);
const mode = z.enum(["PRACTICE", "INDEPENDENT_CHECK", "REVISION"]);
const provenance = z.enum(["in_app", "pasted", "tutor_live", "manual_import"]);
const score = z.number().int().min(0).max(4);

const inboxRow = z.object({
  episode_id: text,
  attempt_id: text,
  learner_id: text,
  alias: text,
  is_test: z.boolean(),
  title_vi: text,
  step_no: z.number().int(),
  activity_type: text,
  mode,
  purpose: z.array(text),
  provenance,
  attempt_no: z.number().int(),
  is_first_attempt: z.boolean(),
  submitted_at: text,
  restricted: z.boolean(),
  category: z.enum(["tutor", "baseline", "independent", "practice"]),
  targets_total: z.number().int(),
  targets_decided: z.number().int(),
  can_decide: z.boolean(),
});

export function parseInbox(raw: unknown): InboxItem[] {
  return z
    .array(inboxRow)
    .parse(raw ?? [])
    .map((r) => ({
      episodeId: r.episode_id,
      attemptId: r.attempt_id,
      learnerId: r.learner_id,
      alias: r.alias,
      isTest: r.is_test,
      titleVi: r.title_vi,
      stepNo: r.step_no,
      activityType: r.activity_type,
      mode: r.mode,
      purpose: r.purpose,
      provenance: r.provenance,
      attemptNo: r.attempt_no,
      isFirstAttempt: r.is_first_attempt,
      submittedAt: r.submitted_at,
      restricted: r.restricted,
      category: r.category,
      targetsTotal: r.targets_total,
      targetsDecided: r.targets_decided,
      canDecide: r.can_decide,
    }));
}

const decision = z.object({
  id: text,
  decision: z.enum(["AGREE", "MODIFY", "INSUFFICIENT", "REQUEST_MORE"]),
  final_score: score.nullable(),
  final_not_observed: z.boolean(),
  validator_role: z.enum(["tutor", "parent"]),
  validator_name: nullableText,
  reason: nullableText,
  supersedes_id: nullableText,
  at: text,
  current: z.boolean(),
  criteria_results: z.record(z.string(), z.boolean()).nullable().optional().transform((v) => v ?? null),
  rationale: nullableText,
  blind: z.boolean().nullable().optional().transform((v) => v ?? null),
});

const target = z.object({
  key: text,
  is_target: z.boolean(),
  scorable: z.boolean(),
  locked_reason: z.enum(["not_a_skill", "needs_live"]).nullable(),
  title_vi: nullableText,
  dimension: z
    .object({ name_vi: text, rubric_vi: z.record(z.string(), z.string()).nullable().optional() })
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  criteria: z.array(z.object({ id: text, check_vi: text, method: text, computable: z.boolean() })),
  opportunity_rule: nullableText,
  decisions: z.array(decision),
});

const episodeView = z.object({
  episode: z.object({
    id: text,
    is_first_attempt: z.boolean(),
    observed_directly: z.boolean(),
    facets: z.record(z.string(), z.boolean()),
    restricted: z.boolean(),
  }),
  learner: z.object({ id: text, alias: text, track_id: z.enum(["A", "B"]), is_test: z.boolean() }),
  viewer: z.object({ role: z.enum(["tutor", "parent"]), can_decide: z.boolean(), restricted: z.boolean() }),
  attempt: z.object({
    id: text,
    attempt_no: z.number().int(),
    mode,
    provenance,
    submitted_at: text,
    declared_assistance: z.array(text),
    recorded_by_name: nullableText,
  }),
  artifact: z
    .object({ kind: text, content: z.record(z.string(), z.unknown()) })
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  activity: z.object({
    id: text,
    step_no: z.number().int(),
    activity_type: text,
    mode: text,
    purpose: z.array(text),
    time_min: z.number().int().nullable().optional().transform((v) => v ?? null),
  }),
  inquiry: z.object({ id: text, title_vi: text, big_question_en: nullableText, big_question_vi: nullableText }),
  step: z.object({
    prompt_en: nullableText,
    items: z.array(z.object({ id: text, kind: text, stem: text, options: z.array(text) })),
  }),
  sources: z.array(z.object({ id: text, title: text, modality: text })),
  auto_checks: z
    .object({
      total: z.number().int(),
      checked: z.number().int(),
      correct: z.number().int(),
      items: z.record(z.string(), z.object({ kind: text, result: z.enum(["correct", "incorrect", "blank", "needs_person"]) })),
    })
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  keys: z.array(z.object({ item_id: text, kind: z.enum(["answer", "sealed", "note"]), answer: nullableText, explanation_vi: nullableText })),
  assistance: z.array(
    z.object({
      id: z.union([z.number(), z.string()]),
      kind: text,
      detail: nullableText,
      verification: text,
      affects: z.array(text),
      at: text,
      note: nullableText,
      by_name: nullableText,
    }),
  ),
  targets: z.array(target),
  tech: z.object({
    template_id: text,
    template_version: z.number().int(),
    catalogue_version: nullableText,
    descriptor_version: nullableText,
    policy_version: nullableText,
  }),
});

export function parseEpisode(raw: unknown): ReviewEpisodeView {
  const v = episodeView.parse(raw);
  const targets: ReviewTarget[] = v.targets.map((t) => ({
    key: t.key,
    isTarget: t.is_target,
    scorable: t.scorable,
    lockedReason: t.locked_reason,
    titleVi: t.title_vi,
    dimensionNameVi: t.dimension?.name_vi ?? null,
    rubricVi: t.dimension?.rubric_vi ?? null,
    criteria: t.criteria.map((c) => ({ id: c.id, checkVi: c.check_vi, method: c.method, computable: c.computable })),
    opportunityRule: t.opportunity_rule,
    decisions: t.decisions.map((d) => ({
      id: d.id,
      decision: d.decision,
      finalScore: d.final_score as 0 | 1 | 2 | 3 | 4 | null,
      finalNotObserved: d.final_not_observed,
      validatorRole: d.validator_role,
      validatorName: d.validator_name,
      reason: d.reason,
      supersedesId: d.supersedes_id,
      at: d.at,
      current: d.current,
      criteriaResults: d.criteria_results,
      rationale: d.rationale,
      blind: d.blind,
    })),
    current: null,
  }));
  for (const t of targets) t.current = t.decisions.find((d) => d.current) ?? null;
  return {
    episode: {
      id: v.episode.id,
      restricted: v.episode.restricted,
      observedDirectly: v.episode.observed_directly,
      isFirstAttempt: v.episode.is_first_attempt,
      facets: v.episode.facets,
    },
    learner: { id: v.learner.id, alias: v.learner.alias, trackId: v.learner.track_id, isTest: v.learner.is_test },
    viewer: { role: v.viewer.role, canDecide: v.viewer.can_decide, restricted: v.viewer.restricted },
    attempt: {
      id: v.attempt.id,
      attemptNo: v.attempt.attempt_no,
      mode: v.attempt.mode,
      provenance: v.attempt.provenance,
      submittedAt: v.attempt.submitted_at,
      declaredAssistance: v.attempt.declared_assistance,
      recordedByName: v.attempt.recorded_by_name,
    },
    artifact: v.artifact,
    activity: {
      id: v.activity.id,
      stepNo: v.activity.step_no,
      activityType: v.activity.activity_type,
      mode: v.activity.mode,
      purpose: v.activity.purpose,
      timeMin: v.activity.time_min,
    },
    inquiry: { id: v.inquiry.id, titleVi: v.inquiry.title_vi, bigQuestionEn: v.inquiry.big_question_en, bigQuestionVi: v.inquiry.big_question_vi },
    step: { promptEn: v.step.prompt_en, items: v.step.items },
    sources: v.sources,
    autoChecks: v.auto_checks,
    keys: v.keys.map((k) => ({ itemId: k.item_id, kind: k.kind, answer: k.answer, explanationVi: k.explanation_vi })),
    assistance: v.assistance.map((a) => ({
      id: a.id, kind: a.kind, detail: a.detail, verification: a.verification, affects: a.affects, at: a.at, note: a.note, byName: a.by_name,
    })),
    targets,
    tech: {
      templateId: v.tech.template_id,
      templateVersion: v.tech.template_version,
      catalogueVersion: v.tech.catalogue_version,
      descriptorVersion: v.tech.descriptor_version,
      policyVersion: v.tech.policy_version,
    },
  };
}

const noteRow = z.object({
  id: text,
  learner_id: text,
  tutor_member_id: text,
  session_date: text,
  goals: nullableText,
  observed: nullableText,
  support_level: z.enum(["none", "light", "moderate", "heavy"]),
  next_actions: z.array(text),
  practised_target_ids: z.array(text),
  published: z.boolean(),
  supersedes_id: nullableText,
  created_at: text,
});

/** Notes as stored (every version) → views with `current` computed (not superseded by any row in the list). */
export function parseNotes(raw: unknown): LessonNoteView[] {
  const rows = z.array(noteRow).parse(raw ?? []);
  const replaced = new Set(rows.map((r) => r.supersedes_id).filter((x): x is string => x !== null));
  return rows
    .map((r) => ({
      id: r.id,
      learnerId: r.learner_id,
      tutorMemberId: r.tutor_member_id,
      sessionDate: r.session_date,
      goals: r.goals,
      observed: r.observed,
      supportLevel: r.support_level,
      nextActions: r.next_actions,
      practisedTargetIds: r.practised_target_ids,
      published: r.published,
      supersedesId: r.supersedes_id,
      createdAt: r.created_at,
      current: !replaced.has(r.id),
    }))
    .sort((a, b) => (a.sessionDate === b.sessionDate ? b.createdAt.localeCompare(a.createdAt) : b.sessionDate.localeCompare(a.sessionDate)));
}
