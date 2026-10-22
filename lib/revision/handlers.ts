/**
 * Staff handlers of S6 (framework-free). Each one: requireAccess(…, "work:review") for the learner of the work, BEFORE the body; then the
 * body (400) and the score-word check (the app refuses first, the database again); then the store (service-role functions that re-check the
 * actor: D15, author, edit window, rounds). Database refusals become codes the panel can explain; raw database messages never leave.
 */
import { AccessError, requireAccess, type AccessDeps, type AccessGrant, type AccessUser } from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import { fromDbError, ReviewDbError, type HandlerResult } from "@/lib/review/handlers";
import { UUID_RE } from "@/lib/work/schemas";
import { feedbackBodySchema, finishBodySchema } from "./schemas";
import { hasScoreWords } from "./scoreWords";

export type FeedbackItemArg = { text: string; excerpt: string | null; leaf: { kind: "tag" | "target"; ref_key: string } | null };

export interface RevisionStore {
  /** Which learner a piece of work belongs to (service role, read-only), or null. */
  getAttemptLearnerId(attemptId: string): Promise<string | null>;
  writeFeedback(a: {
    attemptId: string; praise: string; items: FeedbackItemArg[]; requiresRevision: boolean; supersedesId: string | null; byMemberId: string; clientId: string;
  }): Promise<unknown>;
  finishRevision(a: {
    attemptId: string; action: "close" | "round2"; checks: { n: number; verdict: string }[]; closingNote: string | null; praise: string | null;
    items: FeedbackItemArg[] | null; byMemberId: string; clientId: string;
  }): Promise<unknown>;
}

export type RevisionDeps = { user: AccessUser; store: RevisionStore; access?: Partial<AccessDeps> };

const fail = (status: 400 | 401 | 403 | 404 | 409, error: string): HandlerResult => ({ status, body: { error, message: apiErrors[status] } });

/** The "(tag)" at the end of a database message → HTTP status + code (spec §6: the panel says what to change). */
const TAGS: [RegExp, 400 | 403 | 404 | 409, string][] = [
  [/\(D15\)/, 403, "tutor_only"],
  [/\(author_only\)/, 403, "author_only"],
  [/\(not_found\)/, 404, "not_found"],
  [/\(score_words\)/, 400, "score_words"],
  [/\(excerpt_not_found\)/, 400, "excerpt_not_found"],
  [/\(excerpt_too_long\)/, 400, "excerpt_too_long"],
  [/\(unknown_leaf\)/, 400, "unknown_leaf"],
  [/\(not_writing\)/, 400, "not_writing"],
  [/\(praise_required\)/, 400, "praise_required"],
  [/\(bad_items\)/, 400, "items_required"],
  [/\(max_rounds\)/, 400, "max_rounds"],
  [/\(checks_incomplete\)/, 400, "checks_incomplete"],
  [/\(closing_too_long\)/, 400, "closing_too_long"],
  [/\(revision_started\)/, 409, "revision_started"],
  [/\(already_given\)/, 409, "already_given"],
  [/\(already_superseded\)/, 409, "already_superseded"],
  [/\(already_finished\)/, 409, "already_finished"],
];

export function fromRevisionDbError(err: unknown): HandlerResult {
  if (err instanceof ReviewDbError) {
    for (const [re, status, code] of TAGS) if (re.test(err.detail)) return fail(status, code);
  }
  return fromDbError(err);
}

async function guardAttempt(deps: RevisionDeps, attemptId: string): Promise<{ ok: true; grant: AccessGrant } | { ok: false; result: HandlerResult }> {
  if (!deps.user?.id) return { ok: false, result: fail(401, "unauthenticated") };
  if (!UUID_RE.test(attemptId)) return { ok: false, result: fail(404, "not_found") };
  const learnerId = await deps.store.getAttemptLearnerId(attemptId);
  if (!learnerId) return { ok: false, result: fail(404, "not_found") };
  try {
    return { ok: true, grant: await requireAccess(deps.user, learnerId, "work:review", deps.access) };
  } catch (err) {
    if (err instanceof AccessError) return { ok: false, result: fail(err.status, err.message) };
    throw err;
  }
}

/** The first problem of a body that the form can explain; anything else is "invalid_body". */
function bodyProblem(issues: readonly { path: readonly PropertyKey[] }[]): string {
  const p = issues[0]?.path ?? [];
  if (p[0] === "praise") return "praise_required";
  if (p[0] === "items" && p.includes("excerpt")) return "excerpt_too_long";
  if (p[0] === "items") return "items_required";
  if (p[0] === "closing_note") return "closing_too_long";
  if (p[0] === "checks") return "checks_incomplete";
  return "invalid_body";
}

const toItems = (items: { text: string; excerpt?: string; leaf?: { kind: "tag" | "target"; ref_key: string } | null }[]): FeedbackItemArg[] =>
  items.map((i) => ({ text: i.text, excerpt: i.excerpt ? i.excerpt : null, leaf: i.leaf ?? null }));

export async function handleWriteFeedback(deps: RevisionDeps, attemptId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guardAttempt(deps, attemptId);
  if (!g.ok) return g.result;
  const parsed = feedbackBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, bodyProblem(parsed.error.issues));
  const b = parsed.data;
  if (hasScoreWords(b.praise) || b.items.some((i) => hasScoreWords(i.text))) return fail(400, "score_words");
  try {
    const r = (await deps.store.writeFeedback({
      attemptId, praise: b.praise, items: toItems(b.items), requiresRevision: b.requires_revision, supersedesId: b.supersedes_id ?? null,
      byMemberId: g.grant.member.id, clientId: b.client_id,
    })) as { id: string; round: number; revision_activity_id: string | null; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { id: r.id, round: r.round, revision_activity_id: r.revision_activity_id, replayed: r.replayed } };
  } catch (err) {
    return fromRevisionDbError(err);
  }
}

export async function handleFinishRevision(deps: RevisionDeps, attemptId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guardAttempt(deps, attemptId);
  if (!g.ok) return g.result;
  const parsed = finishBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, bodyProblem(parsed.error.issues));
  const b = parsed.data;
  const scored = b.action === "close" ? hasScoreWords(b.closing_note) : hasScoreWords(b.praise) || b.items.some((i) => hasScoreWords(i.text));
  if (scored) return fail(400, "score_words");
  try {
    const r = (await deps.store.finishRevision({
      attemptId,
      action: b.action,
      checks: b.checks,
      closingNote: b.action === "close" ? b.closing_note || null : null,
      praise: b.action === "round2" ? b.praise : null,
      items: b.action === "round2" ? toItems(b.items) : null,
      byMemberId: g.grant.member.id,
      clientId: b.client_id,
    })) as { closing_id: string | null; feedback_id: string | null; revision_activity_id: string | null; replayed: boolean };
    return {
      status: r.replayed ? 200 : 201,
      body: { closing_id: r.closing_id, feedback_id: r.feedback_id, revision_activity_id: r.revision_activity_id, replayed: r.replayed },
    };
  } catch (err) {
    return fromRevisionDbError(err);
  }
}
