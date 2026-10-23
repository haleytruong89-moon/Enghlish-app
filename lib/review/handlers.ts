/**
 * Framework-free handlers for the S5 routes. Each one:
 *   1. requireAccess first (401 / 404 outside scope / 403 wrong role) — before reading any body;
 *   2. then validates the body (400);
 *   3. then talks to an injectable ReviewStore (which calls the security-definer functions).
 * D15 (who may decide a checkpoint or live-watched piece of work) is enforced by the database; a refusal there becomes
 * 403 "tutor_only". The handlers never decide it on their own and never return a raw database message.
 */
import type { EngineHook } from "@/lib/engine/runner";
import {
  AccessError,
  requireAccess,
  requireStaff,
  type AccessDeps,
  type AccessGrant,
  type AccessUser,
  type Action,
} from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import { allowRealLearners } from "@/lib/env";
import {
  decisionsBodySchema,
  modifyBodySchema,
  transferMarkBodySchema,
  noteBodySchema,
  offlineBodySchema,
  supportBodySchema,
  type DecisionsBody,
  type ModifyBody,
  type NoteBody,
  type OfflineBody,
  type SupportBody,
} from "./schemas";
import { isCursor, PAGE_SIZE } from "./inbox";
import { parseEpisode, parseInbox, parseNotes } from "./shape";
import { INBOX_FILTERS, type InboxCursor, type InboxFilter, type InboxPage, type LessonNoteView, type ReviewEpisodeView } from "./types";

export class ReviewDbError extends Error {
  constructor(
    public readonly code: string,
    /** Database message. For logs and for recognising D15 only — never sent to the client. */
    public readonly detail: string,
  ) {
    super(`review db error ${code}`);
    this.name = "ReviewDbError";
  }
}

export interface ReviewStore {
  /** Which learner an episode / decision / attempt / activity belongs to (service role, read-only), or null. */
  getEpisodeLearnerId(episodeId: string): Promise<string | null>;
  getDecisionLearnerId(decisionId: string): Promise<string | null>;
  getAttemptLearnerId(attemptId: string): Promise<string | null>;
  getActivityLearnerId(activityId: string): Promise<string | null>;
  /** english.eng_review_inbox / eng_review_episode as the signed-in user (they check auth.uid() themselves). */
  inbox(args: { allowReal: boolean; filter: InboxFilter; limit: number; after: InboxCursor | null }): Promise<unknown>;
  episode(episodeId: string): Promise<unknown>;
  /** Lesson notes of one learner as the signed-in user (RLS decides which versions are visible). */
  listNotes(learnerId: string): Promise<unknown>;
  /** Writes: service role, only after requireAccess. The SQL re-checks the actor (D15). */
  recordReviews(args: { episodeId: string; items: unknown[]; byMemberId: string; clientId: string }): Promise<unknown>;
  modifyDecision(args: { decisionId: string; score: number | null; notObserved: boolean; reason: string; byMemberId: string; clientId: string }): Promise<unknown>;
  recordSupport(args: { attemptId: string; targets: string[]; kind: string; note: string | null; byMemberId: string; clientId: string | null }): Promise<unknown>;
  /** english.eng_mark_episode_transfer (G4, service role): the reviewer's "new topic / source" mark. The SQL re-checks the actor (D15). */
  markTransfer(args: { episodeId: string; value: boolean; byMemberId: string }): Promise<unknown>;
  recordOffline(args: {
    activityId: string; provenance: string; text: string; durationSec: number | null; wordCount: number | null;
    sessionDate: string; assistance: string[]; byMemberId: string; clientId: string; backdateReason: string | null;
  }): Promise<unknown>;
  writeNote(args: {
    learnerId: string; sessionDate: string; goals: string | null; observed: string | null; supportLevel: string; nextActions: string[];
    practised: string[]; published: boolean; supersedes: string | null; byMemberId: string; clientId: string;
  }): Promise<unknown>;
}

export type HandlerDeps = {
  user: AccessUser;
  store: ReviewStore;
  access?: Partial<AccessDeps>;
  /** S7a: recompute the child's skills after a successful, non-replayed write (fail-soft, D16). */
  afterWrite?: EngineHook;
};

export type HandlerResult<T = unknown> = { status: number; body: T };

const fail = (status: 400 | 401 | 403 | 404 | 409, error: string): HandlerResult => ({
  status,
  body: { error, message: apiErrors[status] },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guard(
  deps: HandlerDeps,
  learnerId: string,
  action: Action,
): Promise<{ ok: true; grant: AccessGrant } | { ok: false; result: HandlerResult }> {
  try {
    return { ok: true, grant: await requireAccess(deps.user, learnerId, action, deps.access) };
  } catch (err) {
    if (err instanceof AccessError) return { ok: false, result: fail(err.status, err.message) };
    throw err;
  }
}

/** Resolve "which learner is this id about" for an id in the URL, then run requireAccess for that learner. */
async function guardByRef(
  deps: HandlerDeps,
  id: string,
  lookup: (id: string) => Promise<string | null>,
  action: Action,
): Promise<{ ok: true; grant: AccessGrant } | { ok: false; result: HandlerResult }> {
  if (!deps.user?.id) return { ok: false, result: fail(401, "unauthenticated") };
  if (!UUID_RE.test(id)) return { ok: false, result: fail(404, "not_found") };
  const learnerId = await lookup(id);
  if (!learnerId) return { ok: false, result: fail(404, "not_found") };
  return guard(deps, learnerId, action);
}

/** Map a database error from the write functions to an HTTP answer; anything unknown is rethrown (→ 500, logged). */
export function fromDbError(err: unknown): HandlerResult {
  if (err instanceof ReviewDbError) {
    switch (err.code) {
      case "42501":
        // D15: a parent asking to decide a checkpoint / live-watched piece of work gets a specific, friendly reason.
        return /\(D15\)/.test(err.detail) ? fail(403, "tutor_only") : fail(403, "forbidden");
      case "P0002":
        return fail(404, "not_found");
      case "23505":
        return fail(409, "conflict");
      case "23514":
        // Three date rules of work recorded outside the app get their own answer so the form can say what to change.
        if (/\(date_before_last_attempt\)/.test(err.detail)) return fail(400, "date_before_last_attempt");
        if (/\(step_not_open_on_date\)/.test(err.detail)) return fail(400, "step_not_open_on_date");
        if (/\(backdate_too_early\)/.test(err.detail)) return fail(400, "backdate_too_early");
        if (/\(backdate_not_allowed_for_step\)/.test(err.detail)) return fail(400, "backdate_not_allowed_for_step");
        return fail(400, "invalid");
      case "22023":
        return /\(note_too_long\)/.test(err.detail) ? fail(400, "note_too_long") : fail(400, "invalid");
      case "22004":
      case "22P02":
        return fail(400, "invalid");
    }
  }
  throw err;
}

/** Query of GET /api/review/inbox: ?filter=todo|tutor|independent|baseline|practice|done &limit=1..100 &after_at=<time> &after_id=<episode id>. */
export type InboxQuery = { filter?: string | null; limit?: string | null; after_at?: string | null; after_id?: string | null };

export async function handleInbox(deps: HandlerDeps, query: InboxQuery = {}): Promise<HandlerResult<InboxPage | unknown>> {
  try {
    await requireStaff(deps.user, deps.access);
  } catch (err) {
    if (err instanceof AccessError) return fail(err.status, err.message);
    throw err;
  }
  const filter = query.filter ?? "todo";
  if (!(INBOX_FILTERS as readonly string[]).includes(filter)) return fail(400, "invalid_query");
  let limit = PAGE_SIZE;
  if (query.limit !== undefined && query.limit !== null) {
    if (!/^\d{1,3}$/.test(query.limit) || Number(query.limit) < 1 || Number(query.limit) > 100) return fail(400, "invalid_query");
    limit = Number(query.limit);
  }
  let after: InboxCursor | null = null;
  if (query.after_at || query.after_id) {
    const c = { at: query.after_at, id: query.after_id };
    if (!isCursor(c)) return fail(400, "invalid_query");
    after = c;
  }
  const allowReal = deps.access?.allowRealLearners ?? allowRealLearners();
  return { status: 200, body: parseInbox(await deps.store.inbox({ allowReal, filter: filter as InboxFilter, limit, after })) };
}

export async function handleEpisode(deps: HandlerDeps, episodeId: string): Promise<HandlerResult<{ review: ReviewEpisodeView } | unknown>> {
  const g = await guardByRef(deps, episodeId, (id) => deps.store.getEpisodeLearnerId(id), "work:review");
  if (!g.ok) return g.result;
  const raw = await deps.store.episode(episodeId);
  if (raw === null || raw === undefined) return fail(404, "not_found");
  return { status: 200, body: { review: parseEpisode(raw) } };
}

export async function handleDecisions(deps: HandlerDeps, episodeId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guardByRef(deps, episodeId, (id) => deps.store.getEpisodeLearnerId(id), "work:review");
  if (!g.ok) return g.result;
  const parsed = decisionsBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const body: DecisionsBody = parsed.data;
  try {
    const raw = (await deps.store.recordReviews({
      episodeId,
      items: body.items.map((i) => ({
        target_key: i.target_id,
        score: i.score,
        not_observed: i.not_observed,
        criteria: i.criteria ?? null,
        rationale: i.rationale ?? null,
      })),
      byMemberId: g.grant.member.id,
      clientId: body.client_id,
    })) as { target_key: string; decision_id: string; observation_id: string; replayed: boolean }[];
    const results = raw.map((r) => ({ target_id: r.target_key, decision_id: r.decision_id, replayed: r.replayed }));
    if (!results.every((r) => r.replayed)) await deps.afterWrite?.(g.grant.learner.id, body.items.map((i) => i.target_id));
    return { status: results.every((r) => r.replayed) ? 200 : 201, body: { results } };
  } catch (err) {
    return fromDbError(err);
  }
}

export async function handleModify(deps: HandlerDeps, decisionId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guardByRef(deps, decisionId, (id) => deps.store.getDecisionLearnerId(id), "work:review");
  if (!g.ok) return g.result;
  const parsed = modifyBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const body: ModifyBody = parsed.data;
  try {
    const r = (await deps.store.modifyDecision({
      decisionId,
      score: body.score,
      notObserved: body.not_observed,
      reason: body.reason,
      byMemberId: g.grant.member.id,
      clientId: body.client_id,
    })) as { decision_id: string; replayed: boolean };
    if (!r.replayed) await deps.afterWrite?.(g.grant.learner.id, null);
    return { status: r.replayed ? 200 : 201, body: { decision_id: r.decision_id, replayed: r.replayed } };
  } catch (err) {
    return fromDbError(err);
  }
}

export async function handleMarkTransfer(deps: HandlerDeps, episodeId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guardByRef(deps, episodeId, (id) => deps.store.getEpisodeLearnerId(id), "work:review");
  if (!g.ok) return g.result;
  const parsed = transferMarkBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  try {
    const r = (await deps.store.markTransfer({ episodeId, value: parsed.data.value, byMemberId: g.grant.member.id })) as { value: boolean; replayed: boolean };
    if (!r.replayed) await deps.afterWrite?.(g.grant.learner.id, null);
    return { status: r.replayed ? 200 : 201, body: { value: r.value, replayed: r.replayed } };
  } catch (err) {
    return fromDbError(err);
  }
}

export async function handleSupport(deps: HandlerDeps, attemptId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guardByRef(deps, attemptId, (id) => deps.store.getAttemptLearnerId(id), "work:review");
  if (!g.ok) return g.result;
  const parsed = supportBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    // The one rule the form can fix by itself gets its own answer: the note is too long.
    return fail(400, parsed.error.issues.some((i) => i.path[0] === "note" && i.code === "too_big") ? "note_too_long" : "invalid_body");
  }
  const body: SupportBody = parsed.data;
  try {
    const r = (await deps.store.recordSupport({
      attemptId,
      targets: body.target_ids,
      kind: body.kind,
      note: body.note ?? null,
      byMemberId: g.grant.member.id,
      clientId: body.client_id ?? null,
    })) as { id: string | number; replayed: boolean };
    if (!r.replayed) await deps.afterWrite?.(g.grant.learner.id, body.target_ids);
    return { status: r.replayed ? 200 : 201, body: { id: r.id, replayed: r.replayed } };
  } catch (err) {
    return fromDbError(err);
  }
}

export async function handleOffline(deps: HandlerDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "work:review");
  if (!g.ok) return g.result;
  const parsed = offlineBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const body: OfflineBody = parsed.data;
  // The step must be this learner's: the database authorises by the step's learner, so check they agree here.
  const stepLearner = await deps.store.getActivityLearnerId(body.activity_id);
  if (stepLearner !== g.grant.learner.id) return fail(404, "not_found");
  try {
    const r = (await deps.store.recordOffline({
      activityId: body.activity_id,
      provenance: body.provenance,
      text: body.text,
      durationSec: body.duration_sec ?? null,
      wordCount: body.word_count ?? null,
      sessionDate: body.session_date,
      assistance: body.assistance,
      byMemberId: g.grant.member.id,
      clientId: body.client_id,
      backdateReason: body.backdate_reason ?? null,
    })) as { attempt_id: string; episode_id: string; attempt_no: number; replayed: boolean };
    if (!r.replayed) await deps.afterWrite?.(g.grant.learner.id, null);
    return {
      status: r.replayed ? 200 : 201,
      body: { attempt_id: r.attempt_id, episode_id: r.episode_id, attempt_no: r.attempt_no, replayed: r.replayed },
    };
  } catch (err) {
    return fromDbError(err);
  }
}

export async function handleListNotes(deps: HandlerDeps, learnerId: string): Promise<HandlerResult<{ notes: LessonNoteView[] } | unknown>> {
  const g = await guard(deps, learnerId, "notes:read");
  if (!g.ok) return g.result;
  return { status: 200, body: { notes: parseNotes(await deps.store.listNotes(g.grant.learner.id)) } };
}

export async function handleWriteNote(deps: HandlerDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "notes:write");
  if (!g.ok) return g.result;
  const parsed = noteBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const body: NoteBody = parsed.data;
  // A note written with "Ghi buổi học" (v2) cannot be edited with this older form: it would lose the v2 fields. The database refuses it too.
  if (body.supersedes_id) {
    const target = parseNotes(await deps.store.listNotes(g.grant.learner.id)).find((n) => n.id === body.supersedes_id);
    if (target && (target.supportLevel === null || target.weakTagKeys.length > 0 || target.messageToLearner !== null || target.noteForParent !== null)) {
      return fail(400, "note_is_v2");
    }
  }
  try {
    const r = (await deps.store.writeNote({
      learnerId: g.grant.learner.id,
      sessionDate: body.session_date,
      goals: body.goals ?? null,
      observed: body.observed ?? null,
      supportLevel: body.support_level,
      nextActions: body.next_actions,
      practised: body.practised_target_ids,
      published: body.published,
      supersedes: body.supersedes_id ?? null,
      byMemberId: g.grant.member.id,
      clientId: body.client_id,
    })) as { id: string; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { id: r.id, replayed: r.replayed } };
  } catch (err) {
    return fromDbError(err);
  }
}
