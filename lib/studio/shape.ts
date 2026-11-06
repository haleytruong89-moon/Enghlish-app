// lib/studio/shape.ts
/** Parse the jsonb of the Studio functions (0024). Anything unexpected throws (→ 500, logged) instead of showing a half-right screen. */
import { z } from "zod";
import { studioDraftSchema } from "./schema";
import type { AiSettingsView, DraftFiles, DraftListItem, DraftView, PendingInbox, StudioReviewView } from "./types";

const num = z.union([z.number(), z.string()]).transform(Number);
const status = z.enum(["extracting", "ai_failed", "draft", "approved", "discarded"]);
const fileRow = z.object({ id: z.string(), mime: z.string(), path: z.string() }).nullable();
const draftRow = z.object({
  id: z.string(), learner_id: z.string(), family_id: z.string(), track_id: z.string(), title: z.string(), status, error_code: z.string().nullable(),
  payload: studioDraftSchema, updated_at: z.string(), approved_at: z.string().nullable(), template_id: z.string().nullable(),
  template_version: z.number().int().nullable(), supersedes_draft_id: z.string().nullable(), superseded_by: z.string().nullable(), stale: z.boolean(),
  test_file: fileRow, key_file: fileRow, ai_cost_usd: num,
  assigned: z.array(z.object({ instance_id: z.string(), activity_id: z.string(), due_on: z.string(), start_on: z.string().nullable(), assigned_at: z.string() })),
});

export function parseDraft(raw: unknown, opts: { showCost: boolean }): { view: DraftView; files: DraftFiles } {
  const d = draftRow.parse(raw);
  return {
    view: {
      id: d.id, learnerId: d.learner_id, familyId: d.family_id, trackId: d.track_id, title: d.title, status: d.status, errorCode: d.error_code,
      payload: d.payload, updatedAt: d.updated_at, approvedAt: d.approved_at, templateId: d.template_id, templateVersion: d.template_version,
      supersedesDraftId: d.supersedes_draft_id, supersededBy: d.superseded_by, stale: d.stale,
      testFile: d.test_file ? { id: d.test_file.id, mime: d.test_file.mime } : null,
      keyFile: d.key_file ? { id: d.key_file.id, mime: d.key_file.mime } : null,
      aiCostUsd: opts.showCost ? d.ai_cost_usd : null,
      assigned: d.assigned.map((a) => ({ instanceId: a.instance_id, activityId: a.activity_id, dueOn: a.due_on, startOn: a.start_on, assignedAt: a.assigned_at })),
    },
    files: {
      test: d.test_file ? { path: d.test_file.path, mime: d.test_file.mime } : null,
      key: d.key_file ? { path: d.key_file.path, mime: d.key_file.mime } : null,
    },
  };
}

export function parseDraftList(raw: unknown): DraftListItem[] {
  return z
    .array(z.object({ id: z.string(), title: z.string(), status, updated_at: z.string(), template_id: z.string().nullable(), template_version: z.number().int().nullable(), superseded: z.boolean(), assigned: num }))
    .parse(raw)
    .map((d) => ({ id: d.id, title: d.title, status: d.status, updatedAt: d.updated_at, templateId: d.template_id, templateVersion: d.template_version, superseded: d.superseded, assigned: d.assigned }));
}

export function parsePending(raw: unknown): PendingInbox {
  const p = z
    .object({
      count: num,
      items: z.array(z.object({
        attempt_id: z.string(), learner_id: z.string(), alias: z.string(), is_test: z.boolean(), activity_id: z.string(), title: z.string(),
        submitted_at: z.string(), attempt_no: z.number().int(), waiting_days: z.number().int(),
        items: z.array(z.object({ item_id: z.string(), n: z.number().int(), kind: z.string(), stem: z.string(), expected: z.string().nullable(), accepted: z.array(z.string()), given: z.string() })),
      })),
    })
    .parse(raw);
  return {
    count: p.count,
    attempts: p.items.map((a) => ({
      attemptId: a.attempt_id, learnerId: a.learner_id, alias: a.alias, isTest: a.is_test, activityId: a.activity_id, title: a.title, submittedAt: a.submitted_at,
      attemptNo: a.attempt_no, waitingDays: a.waiting_days,
      items: a.items.map((i) => ({ itemId: i.item_id, n: i.n, kind: i.kind, stem: i.stem, expected: i.expected, accepted: i.accepted, given: i.given })),
    })),
  };
}

/** null / {} → null (not a Studio step, nothing submitted). Strict keys: anything else the database might add never reaches the child. */
export function parseStudioReview(raw: unknown): StudioReviewView | null {
  if (raw === null || raw === undefined || (typeof raw === "object" && Object.keys(raw as object).length === 0)) return null;
  const r = z
    .strictObject({
      attempt_no: z.number().int(),
      submitted_at: z.string(),
      wrong: z.array(z.strictObject({ n: z.number().int(), stem: z.string(), given: z.string(), expected: z.string().nullable(), explanation_vi: z.string().nullable() })),
      pending: z.array(z.number().int()),
    })
    .parse(raw);
  return { attemptNo: r.attempt_no, submittedAt: r.submitted_at, wrong: r.wrong.map((w) => ({ n: w.n, stem: w.stem, given: w.given, expected: w.expected, explanationVi: w.explanation_vi })), pending: r.pending };
}

export function parseAiSettings(raw: unknown): AiSettingsView {
  const s = z
    .object({
      enabled: z.boolean(), monthly_cap_usd: num, soft_cap_usd: num, spent_usd: num, runs_month: num, soft_reached: z.boolean(), updated_at: z.string().nullable(),
      learners: z.array(z.object({ id: z.string(), alias: z.string(), is_test: z.boolean(), ai_text: z.boolean().nullable() })),
    })
    .parse(raw);
  return {
    enabled: s.enabled, monthlyCapUsd: s.monthly_cap_usd, softCapUsd: s.soft_cap_usd, spentUsd: s.spent_usd, runsMonth: s.runs_month, softReached: s.soft_reached,
    updatedAt: s.updated_at, learners: s.learners.map((l) => ({ id: l.id, alias: l.alias, isTest: l.is_test, aiText: l.ai_text })),
  };
}
