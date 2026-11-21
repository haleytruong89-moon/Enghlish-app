import "server-only";
import { parseSubmissionFeedback } from "@/lib/practice/shape";
import type { SubmissionFeedbackView } from "@/lib/practice/types";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Feedback adults wrote on Studio attempts of one child (0037), newest first, in the shape of submission feedback
 * (submissionId = the attempt, assignmentId = the step). Service role: call ONLY after the page checked access.
 * Before 0037 is applied the function is missing: null (the form is simply left out).
 */
export async function loadStudioFeedback(learnerId: string, attemptId: string | null = null): Promise<SubmissionFeedbackView[] | null> {
  const { data, error } = await createAdminClient().rpc("eng_studio_feedback", { p_learner: learnerId, p_attempt: attemptId });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return null;
    throw new Error(`eng_studio_feedback: ${error.code ?? "error"}`);
  }
  return parseSubmissionFeedback(data);
}
