/**
 * Framework-free handlers of the W4d goal routes.
 *   - the child proposes / withdraws (session → their own learner → requireAccess "work:submit", like every route of the child);
 *   - the child's tutor decides (requireAccess "goals:decide": 401 / 404 / 403 — the parent only reads).
 * Then zod (400) and an injectable store (security-definer functions). The SQL checks the actor again.
 */
import { AccessError, requireAccess, type AccessDeps, type AccessGrant, type AccessUser, type Role } from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import type { HandlerResult } from "@/lib/review/handlers";
import { goalError } from "./errors";
import { decideBodySchema, GOAL_ID, proposeBodySchema, withdrawBodySchema } from "./schemas";

export interface GoalStore {
  /** The signed-in user's role and, for a student, their learner id. Null = not a member. */
  getOwnProfile(userId: string): Promise<{ role: Role; learnerId: string | null } | null>;
  /** eng_my_propose_goal as the signed-in student. */
  propose(a: { pieces: number; clientId: string }): Promise<unknown>;
  /** eng_my_withdraw_goal as the signed-in student. */
  withdraw(a: { goalId: string; clientId: string }): Promise<unknown>;
  /** eng_decide_goal with the service role, only after requireAccess. */
  decide(a: { goalId: string; action: "accept" | "adjust"; pieces: number | null; byMemberId: string; clientId: string; learnerId: string }): Promise<unknown>;
}

export type GoalDeps = { user: AccessUser; store: GoalStore; access?: Partial<AccessDeps> };

const fail = (status: 400 | 401 | 403 | 404 | 409, error: string): HandlerResult => ({ status, body: { error, message: apiErrors[status] } });

async function ownLearner(deps: GoalDeps): Promise<{ ok: true; grant: AccessGrant } | { ok: false; result: HandlerResult }> {
  if (!deps.user?.id) return { ok: false, result: fail(401, "unauthenticated") };
  const profile = await deps.store.getOwnProfile(deps.user.id);
  if (!profile) return { ok: false, result: fail(404, "not_found") };
  if (profile.role !== "student") return { ok: false, result: fail(403, "forbidden") };
  if (!profile.learnerId) return { ok: false, result: fail(404, "not_found") };
  try {
    return { ok: true, grant: await requireAccess(deps.user, profile.learnerId, "work:submit", deps.access) };
  } catch (err) {
    if (err instanceof AccessError) return { ok: false, result: fail(err.status, err.message) };
    throw err;
  }
}

const isReplay = (raw: unknown) => !!raw && typeof raw === "object" && (raw as { replayed?: unknown }).replayed === true;

export async function handleProposeGoal(deps: GoalDeps, rawBody: unknown): Promise<HandlerResult> {
  const g = await ownLearner(deps);
  if (!g.ok) return g.result;
  const parsed = proposeBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  try {
    const raw = await deps.store.propose({ pieces: parsed.data.pieces, clientId: parsed.data.client_id });
    return { status: isReplay(raw) ? 200 : 201, body: { ok: true, replayed: isReplay(raw) } };
  } catch (err) {
    return goalError(err);
  }
}

export async function handleWithdrawGoal(deps: GoalDeps, rawBody: unknown): Promise<HandlerResult> {
  const g = await ownLearner(deps);
  if (!g.ok) return g.result;
  const parsed = withdrawBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  try {
    const raw = await deps.store.withdraw({ goalId: parsed.data.goal_id, clientId: parsed.data.client_id });
    return { status: isReplay(raw) ? 200 : 201, body: { ok: true, replayed: isReplay(raw) } };
  } catch (err) {
    return goalError(err);
  }
}

/** POST /api/learners/:id/goals/:gid — the child's tutor accepts or adjusts a proposal. The start day is set by the database, never sent. */
export async function handleDecideGoal(deps: GoalDeps, learnerId: string, goalId: string, rawBody: unknown): Promise<HandlerResult> {
  let grant: AccessGrant;
  try {
    grant = await requireAccess(deps.user, learnerId, "goals:decide", deps.access);
  } catch (err) {
    if (err instanceof AccessError) return fail(err.status, err.message);
    throw err;
  }
  if (!GOAL_ID.safeParse(goalId).success) return fail(404, "not_found");
  const parsed = decideBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  try {
    const r = (await deps.store.decide({
      goalId, action: parsed.data.action, pieces: parsed.data.action === "adjust" ? (parsed.data.pieces as number) : null, byMemberId: grant.member.id, clientId: parsed.data.client_id, learnerId: grant.learner.id,
    })) as { id: string; pieces: number; applies_from: string; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { id: r.id, pieces: r.pieces, applies_from: r.applies_from, replayed: r.replayed } };
  } catch (err) {
    return goalError(err);
  }
}
