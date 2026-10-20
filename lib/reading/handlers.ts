/**
 * Handler of POST /api/learners/:id/reading-reports (Studio 1A). Same order as lib/tutorwork/handlers.ts:
 * requireAccess first (401 / 404 outside scope / 403), then the body (400), then the service-role store; the SQL re-checks the actor.
 */
import { AccessError, requireAccess, type AccessDeps, type AccessUser } from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import { fromDbError, ReviewDbError, type HandlerResult } from "@/lib/review/handlers";
import { readingReportBodySchema } from "./schemas";

export interface ReadingStore {
  recordReport(a: {
    learnerId: string;
    month: string;
    source: string | null;
    rows: { tag_key: string; questions: number; correct_pct: number }[];
    note: string | null;
    supersedes: string | null;
    byMemberId: string;
    clientId: string;
  }): Promise<unknown>;
}

export type ReadingDeps = { user: AccessUser; store: ReadingStore; access?: Partial<AccessDeps> };

const fail = (status: 400 | 401 | 403 | 404 | 409, error: string): HandlerResult => ({ status, body: { error, message: apiErrors[status] } });

export async function handleRecordReadingReport(deps: ReadingDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  let grant;
  try {
    grant = await requireAccess(deps.user, learnerId, "tutorwork:write", deps.access);
  } catch (err) {
    if (err instanceof AccessError) return fail(err.status, err.message);
    throw err;
  }
  const parsed = readingReportBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const b = parsed.data;
  try {
    const r = (await deps.store.recordReport({
      learnerId: grant.learner.id,
      month: b.month,
      source: b.source ?? null,
      rows: b.rows,
      note: b.note && b.note.length > 0 ? b.note : null,
      supersedes: b.supersedes_id ?? null,
      byMemberId: grant.member.id,
      clientId: b.client_id,
    })) as { id: string; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { id: r.id, replayed: r.replayed } };
  } catch (err) {
    if (err instanceof ReviewDbError && err.code === "23505" && /\(duplicate_month\)/.test(err.detail)) return fail(409, "duplicate_month");
    if (err instanceof ReviewDbError && err.code === "23505" && /\(stale_report\)/.test(err.detail)) return fail(409, "stale_report");
    if (err instanceof ReviewDbError && err.code === "23514" && /\(bad_month\)/.test(err.detail)) return fail(400, "bad_month");
    return fromDbError(err);
  }
}
