/**
 * Access decisions for the S5 pages (parent and tutor only). The page turns the result into redirect("/login") / notFound().
 * Students and anyone outside the child's scope get a plain 404.
 */
import { AccessError, requireAccess, requireStaff, type AccessDeps, type AccessGrant, type AccessUser, type Action, type Member } from "@/lib/auth/requireAccess";

export type PageAccess = { kind: "ok"; grant: AccessGrant } | { kind: "login" } | { kind: "not-found" };
export type StaffAccess = { kind: "ok"; member: Member } | { kind: "login" } | { kind: "not-found" };

export async function authorizeLearnerPage(
  user: AccessUser,
  learnerId: string,
  action: Action,
  deps: Partial<AccessDeps> = {},
): Promise<PageAccess> {
  try {
    return { kind: "ok", grant: await requireAccess(user, learnerId, action, deps) };
  } catch (err) {
    if (err instanceof AccessError) return err.status === 401 ? { kind: "login" } : { kind: "not-found" };
    throw err;
  }
}

export async function authorizeStaffPage(user: AccessUser, deps: Partial<AccessDeps> = {}): Promise<StaffAccess> {
  try {
    return { kind: "ok", member: await requireStaff(user, deps) };
  } catch (err) {
    if (err instanceof AccessError) return err.status === 401 ? { kind: "login" } : { kind: "not-found" };
    throw err;
  }
}
