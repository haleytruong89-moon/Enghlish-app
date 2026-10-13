/**
 * Access decision for the tracked-skills page. Kept free of Next.js so it can be unit-tested:
 * the page turns the result into redirect("/login") / notFound().
 * Students never get this page; anyone outside the learner's scope gets "not-found" (never 403).
 */
import { AccessError, requireAccess, type AccessDeps, type AccessGrant, type AccessUser } from "@/lib/auth/requireAccess";

export type TargetsAccess =
  | { kind: "ok"; grant: AccessGrant }
  | { kind: "login" }
  | { kind: "not-found" };

export async function authorizeTargetsPage(
  user: AccessUser,
  learnerId: string,
  deps: Partial<AccessDeps> = {},
): Promise<TargetsAccess> {
  try {
    return { kind: "ok", grant: await requireAccess(user, learnerId, "targets:read", deps) };
  } catch (err) {
    if (err instanceof AccessError) return err.status === 401 ? { kind: "login" } : { kind: "not-found" };
    throw err;
  }
}
