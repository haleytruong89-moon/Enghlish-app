import "server-only";
import { parseFeedbackPanel, parseRevisionList, parseRevisionView } from "./shape";
import { callRevisionRpc } from "./supabaseStore";
import type { FeedbackPanelView, RevisionListItem, RevisionView } from "./types";

/** The pages call these only after requireAccess / requireLearnerPage for the learner of the work. */
export async function loadFeedbackPanel(attemptId: string, byMemberId: string): Promise<FeedbackPanelView | null> {
  return parseFeedbackPanel(await callRevisionRpc("eng_feedback_panel", { p_attempt: attemptId, p_by: byMemberId }));
}
export async function loadRevisionView(attemptId: string, byMemberId: string): Promise<RevisionView | null> {
  return parseRevisionView(await callRevisionRpc("eng_revision_view", { p_attempt: attemptId, p_by: byMemberId }));
}
export async function loadRevisionList(learnerId: string): Promise<RevisionListItem[]> {
  return parseRevisionList(await callRevisionRpc("eng_revision_list", { p_learner: learnerId }));
}
