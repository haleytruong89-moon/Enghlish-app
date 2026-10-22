/**
 * Framework-free handlers for the student work routes (S4). Each one:
 *   1. requires a session (401), then resolves the learner the request is about;
 *   2. requireAccess(…, "work:submit") BEFORE reading any body: outsiders get 404, staff get 403
 *      (the student routes belong to the student; staff review is S5);
 *   3. validates the body (400) and talks to an injectable WorkStore.
 * Answers go through the allowlist parsers in ./shape: no key, auto-check result, transcript or note can leave here.
 */
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
  // "Việc cần ôn" by domain (SM-2) must never take the home down: unreadable or unexpected → left out (null).
  const [raw, review] = await Promise.all([deps.store.getHome(), deps.store.getReviewByDomain().then(parseReviewByDomain).catch(() => null)]);
  const home = toHomeView(raw);
  return { status: 200, body: { learner: { alias: g.grant.learner.alias }, ...home, review } };
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
    return { status: receipt.replayed ? 200 : 201, body: { receipt } };
  } catch (err) {
    return fromDbError(err);
  }
}
