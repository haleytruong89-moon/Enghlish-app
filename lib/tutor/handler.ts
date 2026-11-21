/**
 * POST /api/student/activities/:id/hints — the child pressed "Hỏi" / "Gợi ý tiếp" or sent a short question about one question.
 * Login first; the user id comes from the session only. Body: {item_id, client_id, question?}. Everything else is decided by the
 * database (owner, test flag, not sent) and the turn (levels, limit, checks). Never returns the answer.
 */
import { z } from "zod";
import { runTutorTurn, type TutorDeps, type TurnResult } from "./turn";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const hintBodySchema = z.strictObject({
  item_id: z.string().regex(/^q[1-9][0-9]{0,2}$/),
  client_id: z.string().trim().min(8).max(100),
  question: z.string().trim().max(200).optional(),
});

export async function handleStudentHint(
  deps: TutorDeps & { user: { id: string } | null },
  activityId: string,
  raw: unknown,
): Promise<TurnResult | { status: 401; body: { error: string } }> {
  if (!deps.user) return { status: 401, body: { error: "unauthenticated" } };
  if (!UUID_RE.test(activityId)) return { status: 404, body: { error: "not_found" } };
  const p = hintBodySchema.safeParse(raw);
  if (!p.success) return { status: 400, body: { error: "invalid_body" } };
  return runTutorTurn(deps, { userId: deps.user.id, activityId, itemId: p.data.item_id, clientId: p.data.client_id, childText: p.data.question?.trim() || null });
}
