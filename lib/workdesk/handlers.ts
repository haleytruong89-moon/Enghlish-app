/**
 * Handlers of the W1 writes: POST /api/learners/:id/teaching-notes and .../intake (the child's tutor only), POST /api/feedback (tutor or
 * parent) and POST /api/feedback/:id (parent only: status + reply). Access first (401 / 404 outside scope / 403), then the body (400),
 * then the service-role store; the SQL (migration 0025) checks the actor again.
 */
import { AccessError, requireAccess, requireStaff, type AccessDeps, type AccessGrant, type AccessUser, type Member } from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import { fromDbError, ReviewDbError, type HandlerResult } from "@/lib/review/handlers";
import { appFeedbackBodySchema, feedbackUpdateBodySchema, intakeBodySchema, teachingNoteBodySchema } from "./schemas";

export interface WorkdeskStore {
  /** english.eng_write_teaching_note (service role). */
  writeNote(a: { learnerId: string; field: string; text: string; byMemberId: string; clientId: string }): Promise<unknown>;
  /** english.eng_write_intake (service role). */
  writeIntake(a: { learnerId: string; content: Record<string, unknown>; byMemberId: string; clientId: string }): Promise<unknown>;
  /** english.eng_send_app_feedback (service role). */
  sendFeedback(a: { kind: string; screen: string; text: string; byMemberId: string; clientId: string }): Promise<unknown>;
  /** english.eng_update_app_feedback (service role). */
  updateFeedback(a: { feedbackId: string; status: string; reply: string | null; byMemberId: string; clientId: string }): Promise<unknown>;
}

export type WorkdeskDeps = { user: AccessUser; store: WorkdeskStore; access?: Partial<AccessDeps> };

type FailStatus = 400 | 401 | 403 | 404 | 409;
const fail = (status: FailStatus, error: string): HandlerResult => ({ status, body: { error, message: apiErrors[status] } });

async function guardLearner(deps: WorkdeskDeps, learnerId: string): Promise<{ ok: true; grant: AccessGrant } | { ok: false; result: HandlerResult }> {
  try {
    return { ok: true, grant: await requireAccess(deps.user, learnerId, "teaching:write", deps.access) };
  } catch (err) {
    if (err instanceof AccessError) return { ok: false, result: fail(err.status, err.message) };
    throw err;
  }
}

async function guardStaff(deps: WorkdeskDeps): Promise<{ ok: true; member: Member } | { ok: false; result: HandlerResult }> {
  try {
    return { ok: true, member: await requireStaff(deps.user, deps.access) };
  } catch (err) {
    if (err instanceof AccessError) return { ok: false, result: fail(err.status, err.message) };
    throw err;
  }
}

/** The tags in brackets that migration 0025 puts in its messages, and what the screens are told. */
const DB_ANSWERS: { code: string; tag: string; status: FailStatus; error: string }[] = [
  { code: "42501", tag: "tutor_only", status: 403, error: "teaching_tutor_only" },
  { code: "42501", tag: "parent_only", status: 403, error: "feedback_parent_only" },
  { code: "42501", tag: "staff_only", status: 403, error: "forbidden" },
  { code: "22023", tag: "bad_field", status: 400, error: "invalid" },
  { code: "22023", tag: "bad_content", status: 400, error: "invalid" },
  { code: "22023", tag: "bad_kind", status: 400, error: "invalid" },
  { code: "22023", tag: "bad_status", status: 400, error: "invalid" },
  { code: "22023", tag: "too_long", status: 400, error: "too_long" },
];

function mapDbError(err: unknown): HandlerResult {
  if (err instanceof ReviewDbError) {
    const hit = DB_ANSWERS.find((a) => a.code === err.code && err.detail.includes(`(${a.tag})`));
    if (hit) return fail(hit.status, hit.error);
  }
  return fromDbError(err);
}

const done = (r: { id: string; replayed: boolean }): HandlerResult => ({ status: r.replayed ? 200 : 201, body: { id: r.id, replayed: r.replayed } });

export async function handleWriteTeachingNote(deps: WorkdeskDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guardLearner(deps, learnerId);
  if (!g.ok) return g.result;
  const parsed = teachingNoteBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const b = parsed.data;
  try {
    return done((await deps.store.writeNote({ learnerId: g.grant.learner.id, field: b.field, text: b.text, byMemberId: g.grant.member.id, clientId: b.client_id })) as { id: string; replayed: boolean });
  } catch (err) {
    return mapDbError(err);
  }
}

export async function handleWriteIntake(deps: WorkdeskDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guardLearner(deps, learnerId);
  if (!g.ok) return g.result;
  const parsed = intakeBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const { client_id, ...content } = parsed.data;
  // Empty entries are dropped so "no text" never reads as a strength or weakness.
  const clean = (m: Record<string, string | undefined>) => Object.fromEntries(Object.entries(m).filter(([, v]) => v && v.length > 0));
  try {
    return done(
      (await deps.store.writeIntake({
        learnerId: g.grant.learner.id,
        content: { goals: content.goals, strengths: clean(content.strengths), weaknesses: clean(content.weaknesses), note: content.note },
        byMemberId: g.grant.member.id,
        clientId: client_id,
      })) as { id: string; replayed: boolean },
    );
  } catch (err) {
    return mapDbError(err);
  }
}

export async function handleSendAppFeedback(deps: WorkdeskDeps, rawBody: unknown): Promise<HandlerResult> {
  const g = await guardStaff(deps);
  if (!g.ok) return g.result;
  const parsed = appFeedbackBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const b = parsed.data;
  try {
    return done((await deps.store.sendFeedback({ kind: b.kind, screen: b.screen, text: b.text, byMemberId: g.member.id, clientId: b.client_id })) as { id: string; replayed: boolean });
  } catch (err) {
    return mapDbError(err);
  }
}

export async function handleUpdateAppFeedback(deps: WorkdeskDeps, feedbackId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guardStaff(deps);
  if (!g.ok) return g.result;
  if (g.member.role !== "parent") return fail(403, "feedback_parent_only");
  const parsed = feedbackUpdateBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const b = parsed.data;
  const reply = b.reply?.trim();
  try {
    return done(
      (await deps.store.updateFeedback({ feedbackId, status: b.status, reply: reply && reply.length > 0 ? reply : null, byMemberId: g.member.id, clientId: b.client_id })) as {
        id: string;
        replayed: boolean;
      },
    );
  } catch (err) {
    return mapDbError(err);
  }
}
