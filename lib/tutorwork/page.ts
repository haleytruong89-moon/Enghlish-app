import "server-only";
import { notFound, redirect } from "next/navigation";
import type { AccessGrant, Action } from "@/lib/auth/requireAccess";
import { authorizeLearnerPage } from "@/lib/review/access";
import { getAuthUser } from "@/lib/auth/session";

/** Gate of a staff page about one learner: no session → login; students and outsiders → plain 404. */
export async function requireLearnerPage(learnerId: string, action: Action): Promise<AccessGrant> {
  const user = await getAuthUser();
  const access = await authorizeLearnerPage(user, learnerId, action);
  if (access.kind === "login") redirect("/login");
  if (access.kind === "not-found") notFound();
  return access.grant;
}
