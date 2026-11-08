/**
 * Handlers of the W3 point routes. Same order as lib/skills/handlers.ts: requireAccess / requireStaff first (401 / 404 outside scope / 403),
 * then the body (400), then the service-role store. The SQL checks the actor again (only the child's tutor confirms a point level; one
 * answer per proposal, no bulk). After a new decision the point is recomputed, fail-soft.
 */
import { AccessError, requireAccess, requireStaff, type AccessDeps, type AccessGrant, type AccessUser, type Action } from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import { allowRealLearners } from "@/lib/env";
import { isMissingFunction } from "@/lib/engine/runner";
import { pointEvidenceKeyFor, rebuildPoints, recomputePoints, type PointEngineStore } from "@/lib/engine/points/runner";
import { fromDbError, ReviewDbError, type HandlerResult } from "@/lib/review/handlers";
import { decidePointBodySchema } from "./schemas";
import { parsePointInbox, parsePointMap } from "./shape";

export interface PointStore {
  /** Which learner a point decision belongs to (service role, read-only), or null. */
  getDecisionLearnerId(decisionId: string): Promise<string | null>;
  /** The point (error_tags.key) of a decision, or null. */
  getDecisionTag(decisionId: string): Promise<string | null>;
  /** english.eng_point_map / eng_point_inbox (service role, after requireAccess / requireStaff). */
  map(learnerId: string): Promise<unknown>;
  inbox(a: { byMemberId: string; allowReal: boolean }): Promise<unknown>;
  /** english.eng_decide_point (service role). */
  decide(a: { decisionId: string; action: "confirm" | "reject" | "lower"; reason: string | null; byMemberId: string; clientId: string; evidenceKey: string | null }): Promise<unknown>;
}

export type PointDeps = {
  user: AccessUser;
  store: PointStore;
  engine: PointEngineStore;
  access?: Partial<AccessDeps>;
  /** Where an engine error after a decision goes (app_errors); the decision itself already succeeded. */
  log?: (err: unknown) => Promise<void>;
};

type FailStatus = 400 | 401 | 403 | 404 | 409;
const fail = (status: FailStatus, error: string): HandlerResult => ({ status, body: { error, message: apiErrors[status] } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guard(deps: PointDeps, learnerId: string, action: Action): Promise<{ ok: true; grant: AccessGrant } | { ok: false; result: HandlerResult }> {
  try {
    return { ok: true, grant: await requireAccess(deps.user, learnerId, action, deps.access) };
  } catch (err) {
    if (err instanceof AccessError) return { ok: false, result: fail(err.status, err.message) };
    throw err;
  }
}

/** The tags migration 0027 puts at the end of its messages, and what the screens are told. */
const DB_ANSWERS: { code: string; tag: string; status: FailStatus; error: string }[] = [
  { code: "42501", tag: "tutor_only", status: 403, error: "skill_tutor_only" },
  { code: "42501", tag: "staff_only", status: 403, error: "forbidden" },
  { code: "23505", tag: "already_answered", status: 409, error: "already_answered" },
  { code: "23505", tag: "client_reused", status: 409, error: "conflict" },
  { code: "23514", tag: "reason_required", status: 400, error: "skill_reason_required" },
  { code: "23514", tag: "stale_proposal", status: 409, error: "stale_proposal" },
  { code: "22023", tag: "flag_keep_or_edit", status: 400, error: "flag_keep_or_edit" },
  { code: "22023", tag: "not_a_proposal", status: 400, error: "not_a_proposal" },
  { code: "22023", tag: "not_a_flag", status: 400, error: "not_a_proposal" },
  { code: "22023", tag: "reason_too_long", status: 400, error: "invalid_body" },
  { code: "22023", tag: "bad_action", status: 400, error: "invalid_body" },
];

function mapDbError(err: unknown): HandlerResult {
  if (err instanceof ReviewDbError) {
    const hit = DB_ANSWERS.find((a) => a.code === err.code && err.detail.includes(`(${a.tag})`));
    if (hit) return fail(hit.status, hit.error);
  }
  return fromDbError(err);
}

export async function handlePointMap(deps: PointDeps, learnerId: string): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "points:read");
  if (!g.ok) return g.result;
  return { status: 200, body: { map: parsePointMap(await deps.store.map(g.grant.learner.id)) } };
}

export async function handlePointInbox(deps: PointDeps): Promise<HandlerResult> {
  let memberId: string;
  try {
    memberId = (await requireStaff(deps.user, deps.access)).id;
  } catch (err) {
    if (err instanceof AccessError) return fail(err.status, err.message);
    throw err;
  }
  const allowReal = deps.access?.allowRealLearners ?? allowRealLearners();
  return { status: 200, body: { inbox: parsePointInbox(await deps.store.inbox({ byMemberId: memberId, allowReal })) } };
}

export async function handleDecidePoint(deps: PointDeps, decisionId: string, rawBody: unknown): Promise<HandlerResult> {
  if (!deps.user?.id) return fail(401, "unauthenticated");
  if (!UUID_RE.test(decisionId)) return fail(404, "not_found");
  const learnerId = await deps.store.getDecisionLearnerId(decisionId);
  if (!learnerId) return fail(404, "not_found");
  const g = await guard(deps, learnerId, "points:decide");
  if (!g.ok) return g.result;
  const parsed = decidePointBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, parsed.error.issues.some((i) => i.path[0] === "reason") ? "skill_reason_required" : "invalid_body");
  const b = parsed.data;
  try {
    // Lowering a level is a hand-set level: remember the evidence the tutor is looking at, so the engine does not lift it again on the same evidence (B2).
    let evidenceKey: string | null = null;
    if (b.action === "lower") {
      const tag = await deps.store.getDecisionTag(decisionId);
      if (tag) evidenceKey = await pointEvidenceKeyFor(deps.engine, g.grant.learner.id, tag).catch(() => null);
    }
    const r = (await deps.store.decide({
      decisionId, action: b.action, reason: b.reason && b.reason.length > 0 ? b.reason : null, byMemberId: g.grant.member.id, clientId: b.client_id, evidenceKey,
    })) as { id: string; tag_key: string; replayed: boolean };
    if (!r.replayed) {
      try {
        await recomputePoints(deps.engine, g.grant.learner.id, [r.tag_key]);
      } catch (err) {
        if (!isMissingFunction(err)) await deps.log?.(err);
      }
    }
    return { status: r.replayed ? 200 : 201, body: { id: r.id, replayed: r.replayed } };
  } catch (err) {
    return mapDbError(err);
  }
}

export async function handleRebuildPoints(deps: PointDeps, learnerId: string): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "points:rebuild");
  if (!g.ok) return g.result;
  try {
    const s = await rebuildPoints(deps.engine, g.grant.learner.id, g.grant.member.id);
    return { status: 200, body: { points: s.results.length, auto: s.applied.auto, proposed: s.applied.proposed, flagged: s.applied.flagged } };
  } catch (err) {
    return mapDbError(err);
  }
}
