/**
 * Framework-free handlers of the 3B routes (absences, "Bỏ ghi nghỉ", marks on a lesson note). Same shape as lib/tutorwork/handlers.ts:
 * requireAccess first (401 / 404 / 403), then zod (400), then an injectable store (security-definer functions, actor passed as p_by).
 * The learner of a note / absence is checked against the one in the URL (404 otherwise). Nothing here counts or computes sessions.
 */
import { AccessError, requireAccess, type AccessDeps, type AccessGrant, type AccessUser } from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import type { HandlerResult } from "@/lib/review/handlers";
import { sessionError } from "./errors";
import { absenceBodySchema, cancelAbsenceBodySchema, markBodySchema } from "./schemas";

export interface SessionsStore {
  getNoteLearnerId(noteId: string): Promise<string | null>;
  getAbsenceLearnerId(absenceId: string): Promise<string | null>;
  recordAbsence(a: { learnerId: string; absentOn: string; requestedBy: string; billable: boolean; note: string | null; byMemberId: string; clientId: string }): Promise<unknown>;
  cancelAbsence(a: { absenceId: string; reason: string; byMemberId: string; clientId: string }): Promise<unknown>;
  markSession(a: { noteId: string; kind: string; makeupFor: string | null; reason: string | null; byMemberId: string; clientId: string }): Promise<unknown>;
}

export type SessionsDeps = { user: AccessUser; store: SessionsStore; access?: Partial<AccessDeps> };

const fail = (status: 400 | 401 | 403 | 404 | 409, error: string): HandlerResult => ({ status, body: { error, message: apiErrors[status] } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guard(deps: SessionsDeps, learnerId: string): Promise<{ ok: true; grant: AccessGrant } | { ok: false; result: HandlerResult }> {
  try {
    return { ok: true, grant: await requireAccess(deps.user, learnerId, "sessions:mark", deps.access) };
  } catch (err) {
    if (err instanceof AccessError) return { ok: false, result: fail(err.status, err.message) };
    throw err;
  }
}

export async function handleRecordAbsence(deps: SessionsDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId);
  if (!g.ok) return g.result;
  const parsed = absenceBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const b = parsed.data;
  try {
    const r = (await deps.store.recordAbsence({
      learnerId: g.grant.learner.id, absentOn: b.absent_on, requestedBy: b.requested_by, billable: b.billable, note: b.note ? b.note : null,
      byMemberId: g.grant.member.id, clientId: b.client_id,
    })) as { id: string; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { id: r.id, replayed: r.replayed } };
  } catch (err) {
    return sessionError(err);
  }
}

export async function handleCancelAbsence(deps: SessionsDeps, learnerId: string, absenceId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId);
  if (!g.ok) return g.result;
  if (!UUID_RE.test(absenceId)) return fail(404, "not_found");
  const parsed = cancelAbsenceBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  try {
    if ((await deps.store.getAbsenceLearnerId(absenceId)) !== g.grant.learner.id) return fail(404, "not_found");
    const r = (await deps.store.cancelAbsence({ absenceId, reason: parsed.data.reason, byMemberId: g.grant.member.id, clientId: parsed.data.client_id })) as { id: string; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { id: r.id, replayed: r.replayed } };
  } catch (err) {
    return sessionError(err);
  }
}

export async function handleMarkSession(deps: SessionsDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId);
  if (!g.ok) return g.result;
  const parsed = markBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const b = parsed.data;
  try {
    if ((await deps.store.getNoteLearnerId(b.note_id)) !== g.grant.learner.id) return fail(404, "not_found");
    const r = (await deps.store.markSession({
      noteId: b.note_id, kind: b.kind, makeupFor: b.makeup_for ?? null, reason: b.reason ? b.reason : null, byMemberId: g.grant.member.id, clientId: b.client_id,
    })) as { id: string; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { id: r.id, replayed: r.replayed } };
  } catch (err) {
    return sessionError(err);
  }
}
