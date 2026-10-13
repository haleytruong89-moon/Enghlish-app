/**
 * Framework-free handlers for the S2 routes. Each one:
 *   1. requireAccess first (401 / 404 outside scope / 403 wrong role) — before reading any body;
 *   2. then validates the body (400);
 *   3. then talks to an injectable InquiryStore.
 * None of them ever returns answer keys: the store has no method that reads them.
 */
import {
  AccessError,
  requireAccess,
  type AccessDeps,
  type AccessGrant,
  type AccessUser,
} from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import { assignBodySchema, eventBodySchema, type AssignBody, type EventBody } from "./schemas";
import {
  buildInquiryViews,
  buildTemplateViews,
  type ActivityRow,
  type EventRow,
  type InquiryView,
  type InstanceRow,
  type TemplateRow,
  type TemplateView,
} from "./view";

export class InquiryDbError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "InquiryDbError";
  }
}

export interface InquiryStore {
  listPublishedTemplates(trackId: string): Promise<TemplateRow[]>;
  listInstances(learnerId: string): Promise<{ instances: InstanceRow[]; activities: ActivityRow[]; events: EventRow[] }>;
  /** Calls english.eng_assign_inquiry (service role). Returns the inquiry instance id. */
  assign(args: AssignBody & { learnerId: string; byMemberId: string }): Promise<string>;
  /** Learner an activity belongs to, or null. Used only to find the scope before requireAccess. */
  getActivityLearnerId(activityId: string): Promise<string | null>;
  /** Calls english.eng_activity_event (service role). Returns the event id. */
  recordEvent(args: EventBody & { activityId: string; byMemberId: string }): Promise<number>;
}

export type HandlerDeps = {
  user: AccessUser;
  store: InquiryStore;
  access?: Partial<AccessDeps>;
};

export type HandlerResult<T = unknown> = { status: number; body: T };

const fail = (status: 400 | 401 | 403 | 404 | 409, error: string): HandlerResult => ({
  status,
  body: { error, message: apiErrors[status] },
});

async function guard(
  deps: HandlerDeps,
  learnerId: string,
  action: "inquiries:read" | "inquiries:assign" | "activities:event",
): Promise<{ ok: true; grant: AccessGrant } | { ok: false; result: HandlerResult }> {
  try {
    return { ok: true, grant: await requireAccess(deps.user, learnerId, action, deps.access) };
  } catch (err) {
    if (err instanceof AccessError) return { ok: false, result: fail(err.status, err.message) };
    throw err;
  }
}

/** Map a database error from the write functions to an HTTP answer; anything unknown is rethrown (→ 500). */
function fromDbError(err: unknown): HandlerResult {
  if (err instanceof InquiryDbError) {
    switch (err.code) {
      case "42501":
        return fail(403, "forbidden");
      case "P0002":
        return fail(404, "not_found");
      case "23505":
        return fail(409, "conflict");
      case "23514":
      case "22023":
      case "22004":
        return fail(400, "invalid");
    }
  }
  throw err;
}

export async function handleListTemplates(deps: HandlerDeps, learnerId: string): Promise<HandlerResult<{ templates: TemplateView[] } | unknown>> {
  const g = await guard(deps, learnerId, "inquiries:read");
  if (!g.ok) return g.result;
  const rows = await deps.store.listPublishedTemplates(g.grant.learner.trackId);
  return { status: 200, body: { templates: buildTemplateViews(rows) } };
}

export async function handleListInquiries(deps: HandlerDeps, learnerId: string): Promise<HandlerResult<{ inquiries: InquiryView[] } | unknown>> {
  const g = await guard(deps, learnerId, "inquiries:read");
  if (!g.ok) return g.result;
  const { instances, activities, events } = await deps.store.listInstances(g.grant.learner.id);
  return { status: 200, body: { inquiries: buildInquiryViews(instances, activities, events) } };
}

export async function handleAssign(deps: HandlerDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "inquiries:assign");
  if (!g.ok) return g.result;
  const parsed = assignBodySchema(deps.access?.now).safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  try {
    const id = await deps.store.assign({ ...parsed.data, learnerId: g.grant.learner.id, byMemberId: g.grant.member.id });
    return { status: 201, body: { id } };
  } catch (err) {
    return fromDbError(err);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleActivityEvent(deps: HandlerDeps, activityId: string, rawBody: unknown): Promise<HandlerResult> {
  if (!deps.user?.id) return fail(401, "unauthenticated");
  if (!UUID_RE.test(activityId)) return fail(404, "not_found");
  const learnerId = await deps.store.getActivityLearnerId(activityId);
  if (!learnerId) return fail(404, "not_found");

  const g = await guard(deps, learnerId, "activities:event");
  if (!g.ok) return g.result;
  const parsed = eventBodySchema(deps.access?.now).safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  try {
    const id = await deps.store.recordEvent({ ...parsed.data, activityId, byMemberId: g.grant.member.id });
    return { status: 201, body: { id } };
  } catch (err) {
    return fromDbError(err);
  }
}
