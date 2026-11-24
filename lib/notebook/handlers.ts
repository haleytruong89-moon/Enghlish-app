/**
 * E2a · request bodies of the child's tutor + notebook routes (spec §4–§6). The user id comes from the session only; the database decides
 * who the child is. Never a 500 for a model problem (the turns return fixed sentences).
 */
import { z } from "zod";
import { runAgain, runLookup, type LookupDeps, type LookupResult } from "./lookup";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID_RE.test(s);
const clientId = z.string().trim().min(8).max(100);

export const lookupBodySchema = z.strictObject({ word: z.string().max(80), context: z.string().max(400).optional(), client_id: clientId });
export const againBodySchema = z.strictObject({ client_id: clientId });
export const rateBodySchema = z.strictObject({ rating: z.enum(["good", "ok", "confused"]) });
export const saveBodySchema = z.strictObject({ card_id: z.string().regex(UUID_RE), client_id: clientId });
export const setBodySchema = z.strictObject({ action: z.enum(["remove", "restore"]) });

type Unauth = { status: 401; body: { error: string } };
type WithUser = LookupDeps & { user: { id: string } | null };

export async function handleLookup(deps: WithUser, raw: unknown): Promise<LookupResult | Unauth> {
  if (!deps.user) return { status: 401, body: { error: "unauthenticated" } };
  const p = lookupBodySchema.safeParse(raw);
  if (!p.success) return { status: 400, body: { error: "invalid_body" } };
  return runLookup(deps, { userId: deps.user.id, word: p.data.word, context: p.data.context ?? null, clientId: p.data.client_id });
}

export async function handleAgain(deps: WithUser, askId: string, raw: unknown): Promise<LookupResult | Unauth> {
  if (!deps.user) return { status: 401, body: { error: "unauthenticated" } };
  if (!isUuid(askId)) return { status: 404, body: { error: "not_found" } };
  const p = againBodySchema.safeParse(raw);
  if (!p.success) return { status: 400, body: { error: "invalid_body" } };
  return runAgain(deps, { userId: deps.user.id, askId, clientId: p.data.client_id });
}

/** A database error of a child's notebook call → what the screen can explain. */
export function childDbStatus(err: { code?: string } | null): { status: 400 | 403 | 404 | 409 | 500; error: string } {
  if (!err) return { status: 500, error: "internal" };
  if (err.code === "42501") return { status: 403, error: "forbidden" };
  if (err.code === "P0002") return { status: 404, error: "not_found" };
  if (err.code === "PGRST202" || err.code === "42883") return { status: 409, error: "notebook_unavailable" };
  if (err.code === "22023" || err.code === "22004") return { status: 400, error: "invalid_body" };
  return { status: 500, error: "internal" };
}
