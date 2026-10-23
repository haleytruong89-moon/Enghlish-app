/**
 * Handlers of the S7a routes. Same order as lib/levels/handlers.ts: requireAccess / requireStaff first (401 / 404 outside scope / 403), then the
 * body (400), then the service-role store. The SQL checks the actor again (only the child's tutor decides; D15-style). After a new decision the
 * skill is recomputed, fail-soft (D16).
 */
import { AccessError, requireAccess, requireStaff, type AccessDeps, type AccessGrant, type AccessUser, type Action } from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import { allowRealLearners } from "@/lib/env";
import { evidenceKeyFor, isMissingFunction, rebuildLearner, recomputeLearner, type EngineStore } from "@/lib/engine/runner";
import { fromDbError, ReviewDbError, type HandlerResult } from "@/lib/review/handlers";
import { confirmAllBodySchema, decideBodySchema, manualBodySchema } from "./schemas";
import { parseSkillInbox, parseSkillStates } from "./shape";

export interface SkillStore {
  /** Which learner a mastery decision belongs to (service role, read-only), or null. */
  getDecisionLearnerId(decisionId: string): Promise<string | null>;
  /** english.eng_skill_states / eng_skill_inbox (service role, after requireAccess / requireStaff). */
  states(learnerId: string): Promise<unknown>;
  inbox(a: { byMemberId: string; allowReal: boolean }): Promise<unknown>;
  /** english.eng_decide_skill / eng_confirm_skill_proposals / eng_set_skill_state (service role). */
  decide(a: { decisionId: string; action: "confirm" | "reject"; reason: string | null; byMemberId: string; clientId: string }): Promise<unknown>;
  confirmAll(a: { learnerId: string; ids: string[]; byMemberId: string; clientId: string }): Promise<unknown>;
  setManual(a: {
    learnerId: string; targetKey: string; state: "SUPPORTED" | "DEVELOPING"; reason: string; byMemberId: string; clientId: string;
    /** The engine's key of the evidence the tutor saw (B2); null = unknown. */
    evidenceKey: string | null;
  }): Promise<unknown>;
}

export type SkillDeps = {
  user: AccessUser;
  store: SkillStore;
  engine: EngineStore;
  access?: Partial<AccessDeps>;
  /** Where an engine error after a decision goes (app_errors); the decision itself already succeeded. */
  log?: (err: unknown) => Promise<void>;
};

type FailStatus = 400 | 401 | 403 | 404 | 409;
const fail = (status: FailStatus, error: string): HandlerResult => ({ status, body: { error, message: apiErrors[status] } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guard(deps: SkillDeps, learnerId: string, action: Action): Promise<{ ok: true; grant: AccessGrant } | { ok: false; result: HandlerResult }> {
  try {
    return { ok: true, grant: await requireAccess(deps.user, learnerId, action, deps.access) };
  } catch (err) {
    if (err instanceof AccessError) return { ok: false, result: fail(err.status, err.message) };
    throw err;
  }
}

/** The tags migration 0023 puts at the end of its messages, and what the screens are told. */
const DB_ANSWERS: { code: string; tag: string; status: FailStatus; error: string }[] = [
  { code: "42501", tag: "tutor_only", status: 403, error: "skill_tutor_only" },
  { code: "42501", tag: "staff_only", status: 403, error: "forbidden" },
  { code: "23505", tag: "already_answered", status: 409, error: "already_answered" },
  { code: "23505", tag: "client_reused", status: 409, error: "conflict" },
  { code: "23514", tag: "reason_required", status: 400, error: "skill_reason_required" },
  { code: "23514", tag: "same_state", status: 400, error: "same_state" },
  { code: "23514", tag: "stale_proposal", status: 409, error: "stale_proposal" },
  { code: "22023", tag: "flag_not_bulk", status: 400, error: "flag_not_bulk" },
  { code: "22023", tag: "flag_keep_or_edit", status: 400, error: "flag_keep_or_edit" },
  { code: "22023", tag: "not_a_proposal", status: 400, error: "not_a_proposal" },
  { code: "22023", tag: "manual_levels_1_2", status: 400, error: "manual_levels_1_2" },
  { code: "22023", tag: "not_in_set", status: 400, error: "not_in_set" },
];

function mapDbError(err: unknown): HandlerResult {
  if (err instanceof ReviewDbError) {
    const hit = DB_ANSWERS.find((a) => a.code === err.code && err.detail.includes(`(${a.tag})`));
    if (hit) return fail(hit.status, hit.error);
  }
  return fromDbError(err);
}

/** Recompute after a new decision (a confirmed level can open level 4; a closed ⚑ restarts the window). Never fails the decision. */
async function settle(deps: SkillDeps, learnerId: string, targets: string[] | null): Promise<void> {
  try {
    await recomputeLearner(deps.engine, learnerId, targets);
  } catch (err) {
    if (!isMissingFunction(err)) await deps.log?.(err);
  }
}

export async function handleSkillStates(deps: SkillDeps, learnerId: string): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "mastery:read");
  if (!g.ok) return g.result;
  return { status: 200, body: { skills: parseSkillStates(await deps.store.states(g.grant.learner.id)) } };
}

export async function handleSkillInbox(deps: SkillDeps): Promise<HandlerResult> {
  let memberId: string;
  try {
    memberId = (await requireStaff(deps.user, deps.access)).id;
  } catch (err) {
    if (err instanceof AccessError) return fail(err.status, err.message);
    throw err;
  }
  const allowReal = deps.access?.allowRealLearners ?? allowRealLearners();
  return { status: 200, body: { inbox: parseSkillInbox(await deps.store.inbox({ byMemberId: memberId, allowReal })) } };
}

export async function handleDecideSkill(deps: SkillDeps, decisionId: string, rawBody: unknown): Promise<HandlerResult> {
  if (!deps.user?.id) return fail(401, "unauthenticated");
  if (!UUID_RE.test(decisionId)) return fail(404, "not_found");
  const learnerId = await deps.store.getDecisionLearnerId(decisionId);
  if (!learnerId) return fail(404, "not_found");
  const g = await guard(deps, learnerId, "mastery:decide");
  if (!g.ok) return g.result;
  const parsed = decideBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, parsed.error.issues.some((i) => i.path[0] === "reason") ? "skill_reason_required" : "invalid_body");
  const b = parsed.data;
  try {
    const r = (await deps.store.decide({
      decisionId, action: b.action, reason: b.reason && b.reason.length > 0 ? b.reason : null, byMemberId: g.grant.member.id, clientId: b.client_id,
    })) as { id: string; target_key: string; replayed: boolean };
    if (!r.replayed) await settle(deps, g.grant.learner.id, [r.target_key]);
    return { status: r.replayed ? 200 : 201, body: { id: r.id, replayed: r.replayed } };
  } catch (err) {
    return mapDbError(err);
  }
}

export async function handleConfirmAll(deps: SkillDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "mastery:decide");
  if (!g.ok) return g.result;
  const parsed = confirmAllBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  try {
    const r = (await deps.store.confirmAll({ learnerId: g.grant.learner.id, ids: parsed.data.ids, byMemberId: g.grant.member.id, clientId: parsed.data.client_id })) as {
      ids: string[]; replayed: boolean;
    };
    if (!r.replayed) await settle(deps, g.grant.learner.id, null);
    return { status: r.replayed ? 200 : 201, body: { ids: r.ids, replayed: r.replayed } };
  } catch (err) {
    return mapDbError(err);
  }
}

export async function handleManualSkill(deps: SkillDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "mastery:decide");
  if (!g.ok) return g.result;
  const parsed = manualBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, parsed.error.issues.some((i) => i.path[0] === "reason") ? "skill_reason_required" : "invalid_body");
  const b = parsed.data;
  // B2: remember what evidence the tutor was looking at, so the engine does not overturn the level in the same breath. Fail-soft: without the
  // key the level is still set (and the engine may move it when it next runs).
  const evidenceKey = await evidenceKeyFor(deps.engine, g.grant.learner.id, b.target_key).catch(async (err: unknown) => {
    if (!isMissingFunction(err)) await deps.log?.(err);
    return null;
  });
  try {
    const r = (await deps.store.setManual({
      learnerId: g.grant.learner.id, targetKey: b.target_key, state: b.state, reason: b.reason, byMemberId: g.grant.member.id, clientId: b.client_id, evidenceKey,
    })) as { id: string; replayed: boolean };
    if (!r.replayed) await settle(deps, g.grant.learner.id, [b.target_key]);
    return { status: r.replayed ? 200 : 201, body: { id: r.id, replayed: r.replayed } };
  } catch (err) {
    return mapDbError(err);
  }
}

export async function handleRebuild(deps: SkillDeps, learnerId: string): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "mastery:rebuild");
  if (!g.ok) return g.result;
  try {
    const s = await rebuildLearner(deps.engine, g.grant.learner.id, g.grant.member.id);
    return { status: 200, body: { targets: s.results.length, auto: s.applied.auto, proposed: s.applied.proposed, flagged: s.applied.flagged } };
  } catch (err) {
    return mapDbError(err);
  }
}
