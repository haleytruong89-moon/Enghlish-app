/**
 * Framework-free handlers of the W4a routes (place / confirm / edit / remove a milestone, choose the main curriculum).
 * Same shape as lib/sessions/handlers.ts: requireAccess first (401 / 404 / 403 — only the child's tutor holds "roadmap:write"),
 * then zod (400), then an injectable store (security-definer functions, actor passed as p_by). The SQL checks the actor again.
 */
import { AccessError, requireAccess, type AccessDeps, type AccessGrant, type AccessUser } from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import type { HandlerResult } from "@/lib/review/handlers";
import { roadmapError } from "./errors";
import { mainBodySchema, milestoneBodySchema, type MilestoneFields } from "./schemas";

export interface RoadmapStore {
  writeMilestone(a: {
    learnerId: string; milestoneId: string | null; baseVersion: number | null; fields: MilestoneFields | null; status: string; reason: string | null;
    proposalKey: string | null; byMemberId: string; clientId: string;
  }): Promise<unknown>;
  setMain(a: { learnerId: string; curriculumId: string; byMemberId: string; clientId: string }): Promise<unknown>;
}

export type RoadmapDeps = { user: AccessUser; store: RoadmapStore; access?: Partial<AccessDeps> };

const fail = (status: 400 | 401 | 403 | 404 | 409, error: string): HandlerResult => ({ status, body: { error, message: apiErrors[status] } });

async function guard(deps: RoadmapDeps, learnerId: string): Promise<{ ok: true; grant: AccessGrant } | { ok: false; result: HandlerResult }> {
  try {
    return { ok: true, grant: await requireAccess(deps.user, learnerId, "roadmap:write", deps.access) };
  } catch (err) {
    if (err instanceof AccessError) return { ok: false, result: fail(err.status, err.message) };
    throw err;
  }
}

export async function handleWriteMilestone(deps: RoadmapDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId);
  if (!g.ok) return g.result;
  const parsed = milestoneBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const b = parsed.data;
  try {
    const r = (await deps.store.writeMilestone({
      learnerId: g.grant.learner.id, milestoneId: b.milestone_id ?? null, baseVersion: b.base_version ?? null, fields: b.fields ?? null,
      status: b.status, reason: b.reason ? b.reason : null, proposalKey: b.proposal_key ?? null, byMemberId: g.grant.member.id, clientId: b.client_id,
    })) as { milestone_id: string; version: number; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { milestone_id: r.milestone_id, version: r.version, replayed: r.replayed } };
  } catch (err) {
    return roadmapError(err);
  }
}

export async function handleSetMainCurriculum(deps: RoadmapDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId);
  if (!g.ok) return g.result;
  const parsed = mainBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  try {
    const r = (await deps.store.setMain({ learnerId: g.grant.learner.id, curriculumId: parsed.data.curriculum_id, byMemberId: g.grant.member.id, clientId: parsed.data.client_id })) as { id: string; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { id: r.id, replayed: r.replayed } };
  } catch (err) {
    return roadmapError(err);
  }
}
