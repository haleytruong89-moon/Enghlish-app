/**
 * Framework-free handler of POST /api/learners/:id/then-now (W4e). The child's tutor picks two pieces of the child's own writing for the
 * "Ngày ấy – bây giờ" card (or hides the card). Access first (401 / 404 outside scope / 403 for the parent: "teaching:write" is the tutor's),
 * then zod (400), then the note (200 characters, never score-like: 400), then the service-role store; the SQL checks the actor and the pieces again.
 */
import { AccessError, requireAccess, type AccessDeps, type AccessGrant, type AccessUser } from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import type { HandlerResult } from "@/lib/review/handlers";
import { hasScoreWords } from "@/lib/revision/scoreWords";
import { normalizeNote } from "@/lib/student/thenNow";
import { thenNowError } from "./errors";
import { pickBodySchema } from "./schemas";

export interface ThenNowStore {
  /** english.eng_pick_then_now (service role), only after requireAccess. */
  pick(a: { learnerId: string; thenId: string; nowId: string; note: string | null; status: "shown" | "hidden"; byMemberId: string; clientId: string }): Promise<unknown>;
}

export type ThenNowDeps = { user: AccessUser; store: ThenNowStore; access?: Partial<AccessDeps> };

const fail = (status: 400 | 401 | 403 | 404 | 409, error: string): HandlerResult => ({ status, body: { error, message: apiErrors[status] } });

export async function handlePickThenNow(deps: ThenNowDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  let grant: AccessGrant;
  try {
    grant = await requireAccess(deps.user, learnerId, "teaching:write", deps.access);
  } catch (err) {
    if (err instanceof AccessError) return fail(err.status, err.message);
    throw err;
  }
  const parsed = pickBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const note = normalizeNote(parsed.data.note ?? "");
  if (!note.ok) return fail(400, "too_long");
  if (note.note !== null && hasScoreWords(note.note)) return fail(400, "score_words");
  try {
    const r = (await deps.store.pick({
      learnerId: grant.learner.id, thenId: parsed.data.then_id, nowId: parsed.data.now_id, note: note.note, status: parsed.data.status, byMemberId: grant.member.id, clientId: parsed.data.client_id,
    })) as { id: string; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { id: r.id, replayed: r.replayed } };
  } catch (err) {
    return thenNowError(err);
  }
}
