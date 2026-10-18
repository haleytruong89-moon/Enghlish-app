import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { ReviewDbError, type ReviewStore } from "./handlers";

function dbError(what: string, err: { code?: string; message?: string }): never {
  throw new ReviewDbError(err.code ?? "unknown", `${what}: ${err.message ?? err.code ?? "error"}`);
}

async function learnerOf(table: string, id: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from(table)
    .select("learner_id")
    .eq("id", id)
    .maybeSingle<{ learner_id: string }>();
  if (error) dbError(`${table} lookup`, error);
  return data?.learner_id ?? null;
}

/**
 * Reads of the inbox / review view go through the USER client and the security-definer eng_review_* functions (they check
 * auth.uid() themselves). Writes call the service-role functions, and only after the handler ran requireAccess; the SQL then
 * re-checks the actor (D15). Scope lookups (which learner is this id about) use the admin client, read-only.
 */
export function createSupabaseReviewStore(): ReviewStore {
  return {
    getEpisodeLearnerId: (id) => learnerOf("episodes", id),
    getDecisionLearnerId: (id) => learnerOf("validation_decisions", id),
    getActivityLearnerId: (id) => learnerOf("activity_instances", id),
    async getAttemptLearnerId(id) {
      return learnerOf("attempts", id);
    },

    async inbox({ allowReal, filter, limit, after }) {
      const db = await createUserClient();
      const { data, error } = await db.rpc("eng_review_inbox", {
        p_allow_real: allowReal,
        p_filter: filter,
        p_limit: limit,
        p_after_at: after?.at ?? null,
        p_after_id: after?.id ?? null,
      });
      if (error) dbError("eng_review_inbox", error);
      return data;
    },

    async episode(episodeId) {
      const db = await createUserClient();
      const { data, error } = await db.rpc("eng_review_episode", { p_episode: episodeId });
      if (error) dbError("eng_review_episode", error);
      return data ?? null;
    },

    async listNotes(learnerId) {
      const db = await createUserClient();
      const { data, error } = await db
        .from("lesson_notes")
        .select("id, learner_id, tutor_member_id, session_date, goals, observed, support_level, next_actions, practised_target_ids, published, supersedes_id, created_at, weak_tag_keys, message_to_learner, note_for_parent, author_role")
        .eq("learner_id", learnerId)
        .order("session_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) dbError("lesson_notes lookup", error);
      return data ?? [];
    },

    async recordReviews({ episodeId, items, byMemberId, clientId }) {
      const { data, error } = await createAdminClient().rpc("eng_record_reviews", {
        p_episode: episodeId,
        p_items: items,
        p_by: byMemberId,
        p_client_id: clientId,
      });
      if (error) dbError("eng_record_reviews", error);
      return data;
    },

    async modifyDecision({ decisionId, score, notObserved, reason, byMemberId, clientId }) {
      const { data, error } = await createAdminClient().rpc("eng_modify_decision", {
        p_decision: decisionId,
        p_score: score,
        p_not_observed: notObserved,
        p_reason: reason,
        p_by: byMemberId,
        p_client_id: clientId,
      });
      if (error) dbError("eng_modify_decision", error);
      return data;
    },

    async recordSupport({ attemptId, targets, kind, note, byMemberId, clientId }) {
      const { data, error } = await createAdminClient().rpc("eng_record_observed_support", {
        p_attempt: attemptId,
        p_targets: targets,
        p_kind: kind,
        p_note: note,
        p_by: byMemberId,
        p_client_id: clientId,
      });
      if (error) dbError("eng_record_observed_support", error);
      return data;
    },

    async recordOffline(a) {
      const { data, error } = await createAdminClient().rpc("eng_record_offline_attempt", {
        p_activity: a.activityId,
        p_provenance: a.provenance,
        p_text: a.text,
        p_duration_sec: a.durationSec,
        p_word_count: a.wordCount,
        p_session_date: a.sessionDate,
        p_assistance: a.assistance,
        p_by: a.byMemberId,
        p_client_id: a.clientId,
        p_backdate_reason: a.backdateReason,
      });
      if (error) dbError("eng_record_offline_attempt", error);
      return data;
    },

    async writeNote(a) {
      const { data, error } = await createAdminClient().rpc("eng_write_lesson_note", {
        p_learner: a.learnerId,
        p_session_date: a.sessionDate,
        p_goals: a.goals,
        p_observed: a.observed,
        p_support_level: a.supportLevel,
        p_next_actions: a.nextActions,
        p_practised: a.practised,
        p_published: a.published,
        p_supersedes: a.supersedes,
        p_by: a.byMemberId,
        p_client_id: a.clientId,
      });
      if (error) dbError("eng_write_lesson_note", error);
      return data;
    },
  };
}
