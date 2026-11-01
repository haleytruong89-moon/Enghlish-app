/**
 * Framework-free handlers for the student work routes (S4). Each one:
 *   1. requires a session (401), then resolves the learner the request is about;
 *   2. requireAccess(…, "work:submit") BEFORE reading any body: outsiders get 404, staff get 403
 *      (the student routes belong to the student; staff review is S5);
 *   3. validates the body (400) and talks to an injectable WorkStore.
 * Answers go through the allowlist parsers in ./shape: no key, auto-check result, transcript or note can leave here.
 */
import type { EngineHook } from "@/lib/engine/runner";
import {
  AccessError,
  requireAccess,
  type AccessDeps,
  type AccessGrant,
  type AccessUser,
  type Role,
} from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import { parseReviewByDomain } from "@/lib/levels/shape";
import { revisionDraftBodySchema, revisionSubmitBodySchema } from "@/lib/revision/schemas";
import { parseMyActivityNote, parseMyFeedback, parseMyRevision } from "@/lib/revision/shape";
import { attemptBodySchema, draftBodySchema, UUID_RE } from "./schemas";
import { toActivityView, toDraftReceipt, toHomeView, toReceipt } from "./shape";

export class WorkDbError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WorkDbError";
  }
}

export interface WorkStore {
  /** The signed-in user's member role and (for a student) their learner id. Null = not a member. */
  getOwnProfile(userId: string): Promise<{ role: Role; learnerId: string | null } | null>;
  /** Learner an activity belongs to, or null. Used only to find the scope before requireAccess. */
  getActivityLearnerId(activityId: string): Promise<string | null>;
  /** english.eng_my_home() as the signed-in user. */
  getHome(): Promise<unknown>;
  /** english.eng_my_review_by_domain() as the signed-in student: labels and domain names only (SM-2). */
  getReviewByDomain(): Promise<unknown>;
  /** english.eng_my_feedback() as the signed-in student (S6): feedback rows, no score, verdict or leaf. */
  getMyFeedback(): Promise<unknown>;
  /** english.eng_my_activity_note(id) as the signed-in student (S6, G4): the "Chỉ góp ý" note of this activity, or null. */
  getMyActivityNote(activityId: string): Promise<unknown | null>;
  /** english.eng_my_revision(id) as the signed-in student; null = not theirs / nothing to revise there. */
  getMyRevision(activityId: string): Promise<unknown | null>;
  /** english.eng_save_revision_draft as the signed-in student. */
  saveRevisionDraft(args: { activityId: string; content: unknown; baseRevision: number | null }): Promise<unknown>;
  /** english.eng_submit_revision as the signed-in student. */
  submitRevision(args: { activityId: string; clientSubmissionId: string; feedbackId: string; text: string; marks: unknown; assistance: string[]; provenance: string }): Promise<unknown>;
  /** english.eng_my_activity(id) as the signed-in user; null = not theirs / not released yet. */
  getActivity(activityId: string): Promise<unknown | null>;
  /** english.eng_my_step_sources(id) as the signed-in user. */
  getSources(activityId: string): Promise<unknown | null>;
  /** english.eng_save_draft as the signed-in user. */
  saveDraft(args: { activityId: string; content: unknown; baseRevision: number | null }): Promise<unknown>;
  /** english.eng_submit_attempt as the signed-in user. */
  submit(args: { activityId: string; clientSubmissionId: string; content: unknown; assistance: string[]; provenance: string }): Promise<unknown>;
}

export type HandlerDeps = {
  user: AccessUser;
  store: WorkStore;
  access?: Partial<AccessDeps>;
  /** S7a: recompute the child's skills after a new submission (fail-soft, D16). */
  afterWrite?: EngineHook;
};

export type HandlerResult<T = unknown> = { status: number; body: T };

const fail = (status: 400 | 401 | 403 | 404 | 409, error: string): HandlerResult => ({
  status,
  body: { error, message: apiErrors[status] },
});

async function guard(
  deps: HandlerDeps,
  learnerId: string,
): Promise<{ ok: true; grant: AccessGrant } | { ok: false; result: HandlerResult }> {
  try {
    return { ok: true, grant: await requireAccess(deps.user, learnerId, "work:submit", deps.access) };
  } catch (err) {
    if (err instanceof AccessError) return { ok: false, result: fail(err.status, err.message) };
    throw err;
  }
}

/** Map a database error from the student functions to an HTTP answer; anything unknown is rethrown (→ 500). */
function fromDbError(err: unknown): HandlerResult {
  if (err instanceof WorkDbError) {
    switch (err.code) {
      case "42501":
        return fail(403, "forbidden");
      case "P0002":
        return fail(404, "not_found");
      case "23505":
        return fail(409, "conflict");
      case "23514":
      case "22023":
      case "22004":
        return fail(400, "invalid");
    }
  }
  throw err;
}

/** The learner behind the signed-in student (their own). */
async function ownLearner(deps: HandlerDeps): Promise<{ ok: true; grant: AccessGrant } | { ok: false; result: HandlerResult }> {
  if (!deps.user?.id) return { ok: false, result: fail(401, "unauthenticated") };
  const profile = await deps.store.getOwnProfile(deps.user.id);
  if (!profile) return { ok: false, result: fail(404, "not_found") };
  if (profile.role !== "student") return { ok: false, result: fail(403, "forbidden") };
  if (!profile.learnerId) return { ok: false, result: fail(404, "not_found") };
  return guard(deps, profile.learnerId);
}

/** Activity id → access grant for the learner it belongs to (404 when it is not theirs, 403 for staff). */
async function guardActivity(
  deps: HandlerDeps,
  activityId: string,
): Promise<{ ok: true; grant: AccessGrant } | { ok: false; result: HandlerResult }> {
  if (!deps.user?.id) return { ok: false, result: fail(401, "unauthenticated") };
  if (!UUID_RE.test(activityId)) return { ok: false, result: fail(404, "not_found") };
  const learnerId = await deps.store.getActivityLearnerId(activityId);
  if (!learnerId) return { ok: false, result: fail(404, "not_found") };
  return guard(deps, learnerId);
}

export async function handleStudentHome(deps: HandlerDeps): Promise<HandlerResult> {
  const g = await ownLearner(deps);
  if (!g.ok) return g.result;
  // "Việc cần ôn" (SM-2) and the feedback rows (S6) must never take the home down: unreadable or unexpected → left out (null).
  const [raw, review, feedback] = await Promise.all([
    deps.store.getHome(),
    deps.store.getReviewByDomain().then(parseReviewByDomain).catch(() => null),
    deps.store.getMyFeedback().then(parseMyFeedback).catch(() => null),
  ]);
  const home = toHomeView(raw);
  return { status: 200, body: { learner: { alias: g.grant.learner.alias }, ...home, review, feedback } };
}

export async function handleStudentActivity(deps: HandlerDeps, activityId: string): Promise<HandlerResult> {
  const g = await guardActivity(deps, activityId);
  if (!g.ok) return g.result;
  const raw = await deps.store.getActivity(activityId);
  if (!raw) return fail(404, "not_found"); // not released yet: indistinguishable from "does not exist"
  // A step the app cannot do yet gets a neutral status only: its sources are not even requested.
  const supported = !!raw && typeof raw === "object" && (raw as { supported?: unknown }).supported === true;
  const sources = supported ? await deps.store.getSources(activityId) : null;
  return { status: 200, body: { activity: toActivityView(raw, sources) } };
}

export async function handleSaveDraft(deps: HandlerDeps, activityId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guardActivity(deps, activityId);
  if (!g.ok) return g.result;
  const parsed = draftBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  try {
    const raw = await deps.store.saveDraft({
      activityId,
      content: parsed.data.content,
      baseRevision: parsed.data.base_revision ?? null,
    });
    return { status: 200, body: { draft: toDraftReceipt(raw) } };
  } catch (err) {
    return fromDbError(err);
  }
}

export async function handleSubmit(deps: HandlerDeps, rawBody: unknown): Promise<HandlerResult> {
  if (!deps.user?.id) return fail(401, "unauthenticated");
  // The activity id is in the body, so it is read first (only to find the scope); everything else is parsed after access.
  const activityId =
    rawBody && typeof rawBody === "object" && "activity_id" in rawBody ? (rawBody as { activity_id: unknown }).activity_id : undefined;
  if (typeof activityId !== "string" || !UUID_RE.test(activityId)) return fail(400, "invalid_body");
  const g = await guardActivity(deps, activityId);
  if (!g.ok) return g.result;
  const parsed = attemptBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  try {
    const raw = await deps.store.submit({
      activityId,
      clientSubmissionId: parsed.data.client_submission_id,
      content: parsed.data.content,
      assistance: parsed.data.assistance,
      provenance: parsed.data.provenance,
    });
    const receipt = toReceipt(raw);
    if (!receipt.replayed) await deps.afterWrite?.(g.grant.learner.id, null);
    return { status: receipt.replayed ? 200 : 201, body: { receipt } };
  } catch (err) {
    return fromDbError(err);
  }
}

/** Database refusals of the revision functions that the form can explain (the tag is at the end of the message). */
const REVISION_TAGS: [RegExp, 400 | 409, string][] = [
  [/\(marks_incomplete\)/, 400, "marks_incomplete"],
  [/\(reason_required\)/, 400, "reason_required"],
  [/\(unchanged_needs_reason\)/, 400, "unchanged_needs_reason"],
  [/\(reason_too_long\)/, 400, "reason_too_long"],
  [/\(revision_not_open\)/, 409, "revision_not_open"],
  [/\(feedback_changed\)/, 409, "feedback_changed"],
  [/\(already_submitted\)/, 409, "conflict"],
];
function fromRevisionWorkError(err: unknown): HandlerResult {
  if (err instanceof WorkDbError) {
    for (const [re, status, code] of REVISION_TAGS) if (re.test(err.message)) return fail(status, code);
  }
  return fromDbError(err);
}

/** GET /api/student/feedback — the child's feedback rows (S6). */
export async function handleStudentFeedback(deps: HandlerDeps): Promise<HandlerResult> {
  const g = await ownLearner(deps);
  if (!g.ok) return g.result;
  return { status: 200, body: { items: parseMyFeedback(await deps.store.getMyFeedback()) } };
}

/** GET /api/student/revisions/:id — the revision page: praise, items, excerpts, old text, state; never a score, verdict or leaf. */
export async function handleStudentRevision(deps: HandlerDeps, activityId: string): Promise<HandlerResult> {
  const g = await guardActivity(deps, activityId);
  if (!g.ok) return g.result;
  const revision = parseMyRevision(await deps.store.getMyRevision(activityId));
  if (!revision) return fail(404, "not_found");
  return { status: 200, body: { revision } };
}

export async function handleSaveRevisionDraft(deps: HandlerDeps, activityId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guardActivity(deps, activityId);
  if (!g.ok) return g.result;
  const parsed = revisionDraftBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  try {
    const raw = await deps.store.saveRevisionDraft({ activityId, content: parsed.data.content, baseRevision: parsed.data.base_revision ?? null });
    return { status: 200, body: { draft: toDraftReceipt(raw) } };
  } catch (err) {
    return fromRevisionWorkError(err);
  }
}

export async function handleSubmitRevision(deps: HandlerDeps, activityId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guardActivity(deps, activityId);
  if (!g.ok) return g.result;
  const parsed = revisionSubmitBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  try {
    const raw = await deps.store.submitRevision({
      activityId, clientSubmissionId: parsed.data.client_submission_id, feedbackId: parsed.data.feedback_id, text: parsed.data.text, marks: parsed.data.marks,
      assistance: parsed.data.assistance, provenance: parsed.data.provenance,
    });
    const receipt = toReceipt(raw);
    if (!receipt.replayed) await deps.afterWrite?.(g.grant.learner.id, null);
    return { status: receipt.replayed ? 200 : 201, body: { receipt } };
  } catch (err) {
    return fromRevisionWorkError(err);
  }
}

/** The "Chỉ góp ý" note of the child's own activity (G4). Never fatal: unreadable or unexpected → null. */
export async function handleStudentActivityNote(deps: HandlerDeps, activityId: string): Promise<HandlerResult> {
  const g = await guardActivity(deps, activityId);
  if (!g.ok) return g.result;
  const note = await deps.store.getMyActivityNote(activityId).then(parseMyActivityNote).catch(() => null);
  return { status: 200, body: { note } };
}
