/**
 * Preview guard for "Góp ý về app" (W1). Feedback is family-level (no learner), so requireAccess cannot apply the usual rule
 * "real learner while ALLOW_REAL_LEARNERS=false -> 404". Same rule here: while real learners are not allowed (Vercel previews),
 * only families that have NO real (is_test = false) learner may use the page and the two routes; everyone else gets a plain 404.
 */
export async function feedbackAllowedHere(allowReal: boolean, familyId: string, familyHasRealLearner: (familyId: string) => Promise<boolean>): Promise<boolean> {
  if (allowReal) return true;
  return !(await familyHasRealLearner(familyId));
}
