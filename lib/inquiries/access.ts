/**
 * Access decision for the inquiries page (parent and tutor only). Same pattern as the tracked-skills page:
 * the page turns the result into redirect("/login") / notFound(). Students and outsiders: not-found.
 */
import { AccessError, requireAccess, type AccessDeps, type AccessGrant, type AccessUser } from "@/lib/auth/requireAccess";

export type InquiriesAccess = { kind: "ok"; grant: AccessGrant } | { kind: "login" } | { kind: "not-found" };

export async function authorizeInquiriesPage(
  user: AccessUser,
  learnerId: string,
  deps: Partial<AccessDeps> = {},
): Promise<InquiriesAccess> {
  try {
    return { kind: "ok", grant: await requireAccess(user, learnerId, "inquiries:read", deps) };
  } catch (err) {
    if (err instanceof AccessError) return err.status === 401 ? { kind: "login" } : { kind: "not-found" };
    throw err;
  }
}
