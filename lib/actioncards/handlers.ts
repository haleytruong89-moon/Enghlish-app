/**
 * Framework-free handler of POST /api/learners/:id/action-cards (PR-B, 26/11). The child's tutor (or the parent) marks a "Việc nên làm"
 * card "Đã làm" or "Bỏ qua" (with a reason). Access first (401 / 404 outside scope / 403 for a student), then zod (400), then the
 * service-role store; the SQL checks the actor again. The member and the child come from the session and the URL, never from the body.
 */
import { AccessError, requireAccess, type AccessDeps, type AccessGrant, type AccessUser } from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import type { DecidableKind } from "@/lib/results/actions";
import type { HandlerResult } from "@/lib/review/handlers";
import { actionCardError } from "./errors";
import { decideBodySchema } from "./schemas";

export interface ActionCardStore {
  /** english.eng_decide_action_card (service role), only after requireAccess. */
  decide(a: {
    learnerId: string; cardKey: string; kind: DecidableKind; label: string; evidenceAt: string | null; decision: "done" | "skipped"; reason: string | null; byMemberId: string; clientId: string;
  }): Promise<unknown>;
}

export type ActionCardDeps = { user: AccessUser; store: ActionCardStore; access?: Partial<AccessDeps> };

const fail = (status: 400 | 401 | 403 | 404 | 409, error: string): HandlerResult => ({ status, body: { error, message: apiErrors[status] } });

export async function handleDecideActionCard(deps: ActionCardDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  let grant: AccessGrant;
  try {
    grant = await requireAccess(deps.user, learnerId, "tutorwork:write", deps.access);
  } catch (err) {
    if (err instanceof AccessError) return fail(err.status, err.message);
    throw err;
  }
  const parsed = decideBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, parsed.error.issues.some((i) => i.message === "reason_required") ? "reason_required" : "invalid_body");
  const b = parsed.data;
  try {
    const r = (await deps.store.decide({
      learnerId: grant.learner.id, cardKey: b.card_key, kind: b.kind, label: b.label, evidenceAt: b.evidence_at, decision: b.decision,
      reason: b.decision === "skipped" ? (b.reason ?? null) : null, byMemberId: grant.member.id, clientId: b.client_id,
    })) as { id: string; at: string; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { id: r.id, at: r.at, replayed: r.replayed } };
  } catch (err) {
    return actionCardError(err);
  }
}
