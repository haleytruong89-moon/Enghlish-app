import "server-only";
import { parseFeedbackPanel, parseRevisionList, parseRevisionView } from "./shape";
import { createAdminClient } from "@/lib/supabase/admin";
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
/** "Bài đã sửa" is an add-on: if it cannot be read (migration 0021 not applied yet, a hiccup) the caller gets null instead of a 500. */
export async function loadRevisionListSoft(learnerId: string): Promise<RevisionListItem[] | null> {
  try {
    return await loadRevisionList(learnerId);
  } catch {
    return null;
  }
}
/** Can the "Bài đã sửa" books be read at all (migration 0021 applied)? Used to hide the link on the learner card until then. */
let revisionsKnown = false;
export async function revisionsAvailable(): Promise<boolean> {
  // Once the table exists it stays: remember "yes" for the life of the process. "No" is asked again next time (0021 may be applied meanwhile).
  if (revisionsKnown) return true;
  try {
    const { error } = await createAdminClient().from("feedback_notes").select("id").limit(1);
    revisionsKnown = !error;
    return !error;
  } catch {
    return false;
  }
}
