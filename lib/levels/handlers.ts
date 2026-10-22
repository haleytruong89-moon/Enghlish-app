/**
 * Handlers of the SM-2 writes: POST /api/learners/:id/levels (baseline / adjust - the child's tutor only) and
 * POST /api/learners/:id/external-results (tutor or parent). Same order as lib/reading/handlers.ts: requireAccess first (401 / 404
 * outside scope / 403), then the body (400), then - for an exam sheet - a check that storage really holds the file at the path built
 * from ids, then the service-role store. The SQL checks the actor again (a parent can never record a level, even with a forged call).
 */
import { AccessError, requireAccess, type AccessDeps, type AccessGrant, type AccessUser, type Action } from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import type { FileMeta } from "@/lib/practice/schemas";
import { fromDbError, ReviewDbError, type HandlerResult } from "@/lib/review/handlers";
import type { FileStorage } from "@/lib/storage/types";
import { verifyStoredFile } from "@/lib/storage/verify";
import { externalResultBodySchema, recordLevelsBodySchema } from "./schemas";

export interface LevelStore {
  /** english.eng_record_level (service role). */
  recordLevels(a: { learnerId: string; kind: "baseline" | "adjust"; levels: Record<string, string>; reason: string | null; byMemberId: string; clientId: string }): Promise<unknown>;
  /** english.eng_record_external_result (service role). */
  recordExternal(a: {
    learnerId: string; exam: string; takenOn: string; scoreText: string; domains: string[]; note: string | null; file: FileMeta | null;
    byMemberId: string; clientId: string; supersedesId: string | null;
  }): Promise<unknown>;
}

export type LevelDeps = { user: AccessUser; store: LevelStore; storage: FileStorage; access?: Partial<AccessDeps> };

type FailStatus = 400 | 401 | 403 | 404 | 409;
const fail = (status: FailStatus, error: string): HandlerResult => ({ status, body: { error, message: apiErrors[status] } });

async function guard(deps: LevelDeps, learnerId: string, action: Action): Promise<{ ok: true; grant: AccessGrant } | { ok: false; result: HandlerResult }> {
  try {
    return { ok: true, grant: await requireAccess(deps.user, learnerId, action, deps.access) };
  } catch (err) {
    if (err instanceof AccessError) return { ok: false, result: fail(err.status, err.message) };
    throw err;
  }
}

/** The tags in brackets that migration 0020 puts in its messages, and what the screens are told. */
const DB_ANSWERS: { code: string; tag: string; status: FailStatus; error: string }[] = [
  { code: "42501", tag: "tutor_only", status: 403, error: "level_tutor_only" },
  { code: "23505", tag: "already_confirmed", status: 409, error: "already_confirmed" },
  { code: "23514", tag: "needs_baseline", status: 400, error: "needs_baseline" },
  { code: "23514", tag: "same_level", status: 400, error: "same_level" },
  { code: "23514", tag: "reason_required", status: 400, error: "reason_required" },
  { code: "23514", tag: "bad_date", status: 400, error: "bad_date" },
  { code: "23505", tag: "already_superseded", status: 409, error: "already_superseded" },
];

function mapDbError(err: unknown): HandlerResult {
  if (err instanceof ReviewDbError) {
    const hit = DB_ANSWERS.find((a) => a.code === err.code && err.detail.includes(`(${a.tag})`));
    if (hit) return fail(hit.status, hit.error);
  }
  return fromDbError(err);
}

export async function handleRecordLevels(deps: LevelDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "levels:decide");
  if (!g.ok) return g.result;
  const parsed = recordLevelsBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const b = parsed.data;
  const levels: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.levels)) if (v !== undefined) levels[k] = v;
  try {
    const r = (await deps.store.recordLevels({
      learnerId: g.grant.learner.id,
      kind: b.kind,
      levels,
      reason: b.reason && b.reason.length > 0 ? b.reason : null,
      byMemberId: g.grant.member.id,
      clientId: b.client_id,
    })) as { ids: string[]; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { ids: r.ids, replayed: r.replayed } };
  } catch (err) {
    return mapDbError(err);
  }
}

export async function handleRecordExternalResult(deps: LevelDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "tutorwork:write");
  if (!g.ok) return g.result;
  const parsed = externalResultBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const b = parsed.data;
  if (b.file) {
    const bad = await verifyStoredFile(deps.storage, { familyId: g.grant.learner.familyId, learnerId: g.grant.learner.id }, "external_result", b.file);
    if (bad) return fail(400, bad);
  }
  try {
    const r = (await deps.store.recordExternal({
      learnerId: g.grant.learner.id,
      exam: b.exam,
      takenOn: b.taken_on,
      scoreText: b.score_text,
      domains: b.domains,
      note: b.note && b.note.length > 0 ? b.note : null,
      file: b.file ?? null,
      byMemberId: g.grant.member.id,
      clientId: b.client_id,
      supersedesId: b.supersedes_id ?? null,
    })) as { id: string; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { id: r.id, replayed: r.replayed } };
  } catch (err) {
    return mapDbError(err);
  }
}
