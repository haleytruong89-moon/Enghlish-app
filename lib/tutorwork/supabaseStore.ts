import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReviewDbError } from "@/lib/review/handlers";
import { isMissingFunction } from "@/lib/sessions/errors";
import type { TutorWorkStore } from "./handlers";

function dbError(what: string, err: { code?: string; message?: string }): never {
  throw new ReviewDbError(err.code ?? "unknown", `${what}: ${err.message ?? err.code ?? "error"}`);
}

async function learnerOf(table: string, id: string): Promise<string | null> {
  const { data, error } = await createAdminClient().from(table).select("learner_id").eq("id", id).maybeSingle<{ learner_id: string }>();
  if (error) dbError(`${table} lookup`, error);
  return data?.learner_id ?? null;
}

/**
 * Writes call the service-role functions of migration 0014, and only after the handler ran requireAccess; the SQL then re-checks the
 * actor (and D15 for work done in the session). Scope lookups (which learner is this id about) are read-only.
 */
export function createSupabaseTutorWorkStore(): TutorWorkStore {
  const db = () => createAdminClient();
  return {
    getResultLearnerId: (id) => learnerOf("results", id),
    getEpisodeLearnerId: (id) => learnerOf("episodes", id),

    async recordResult(a) {
      const { data, error } = await db().rpc("eng_record_result", {
        p_learner: a.learnerId,
        p_mode: a.mode,
        p_frame: a.frameId,
        p_title: a.title,
        p_total: a.total,
        p_correct: a.correct,
        p_wrong: a.wrong,
        p_tags: a.tags,
        p_context: a.context,
        p_attempt: a.attempt,
        p_used_hint: a.usedHint,
        p_taken_on: a.takenOn,
        p_assignment: a.assignmentId,
        p_supersedes: a.supersedes,
        p_by: a.byMemberId,
        p_client_id: a.clientId,
        p_source: a.source,
      });
      if (error) dbError("eng_record_result", error);
      return data;
    },

    async tagResultItems(a) {
      const { data, error } = await db().rpc("eng_tag_result_items", {
        p_result: a.resultId,
        p_items: a.items,
        p_by: a.byMemberId,
      });
      if (error) dbError("eng_tag_result_items", error);
      return data;
    },

    async addTag(a) {
      const { data, error } = await db().rpc("eng_add_error_tag_v2", {
        p_learner: a.learnerId,
        p_key: a.key,
        p_label: a.label,
        p_group_key: a.groupKey,
        p_by: a.byMemberId,
      });
      if (error) dbError("eng_add_error_tag_v2", error);
      return data;
    },

    async setTagGroup(a) {
      const { data, error } = await db().rpc("eng_set_tag_group", {
        p_learner: a.learnerId,
        p_tag_key: a.tagKey,
        p_group_key: a.groupKey,
        p_by: a.byMemberId,
      });
      if (error) dbError("eng_set_tag_group", error);
      return data;
    },

    async tagEpisode(a) {
      const { data, error } = await db().rpc("eng_tag_episode", {
        p_episode: a.episodeId,
        p_tags: a.tags,
        p_by: a.byMemberId,
      });
      if (error) dbError("eng_tag_episode", error);
      return data;
    },

    async writeSessionNote(a) {
      // 3B: a "Học bù" note = v4 (0030): the note and its mark in one transaction. Before 0030 the missing function becomes sessions_unavailable.
      if (a.sessionKind === "makeup") {
        const { data, error } = await db().rpc("eng_write_lesson_note_v4", {
          p_learner: a.learnerId,
          p_session_date: a.sessionDate,
          p_studied: a.studied,
          p_weak_tags: a.weakTags,
          p_message: a.message,
          p_note_for_parent: a.noteForParent,
          p_rechecks: a.rechecks,
          p_supersedes: a.supersedes,
          p_by: a.byMemberId,
          p_client_id: a.clientId,
          p_practised_target_ids: a.practisedTargetIds,
          p_taught_units: a.taughtUnits ?? [],
          p_session_kind: "makeup",
          p_makeup_for: a.makeupFor ?? null,
        });
        if (error) {
          if (isMissingFunction(error.code)) throw new ReviewDbError("sessions_unavailable", "eng_write_lesson_note_v4 is missing: apply migration 0030");
          dbError("eng_write_lesson_note_v4", error);
        }
        return data;
      }
      // W2: units taught today → v3 (0026). Without units the v2 call is unchanged, so the code also runs before 0026 is applied.
      if (a.taughtUnits && a.taughtUnits.length > 0) {
        const { data, error } = await db().rpc("eng_write_lesson_note_v3", {
          p_learner: a.learnerId,
          p_session_date: a.sessionDate,
          p_studied: a.studied,
          p_weak_tags: a.weakTags,
          p_message: a.message,
          p_note_for_parent: a.noteForParent,
          p_rechecks: a.rechecks,
          p_supersedes: a.supersedes,
          p_by: a.byMemberId,
          p_client_id: a.clientId,
          p_practised_target_ids: a.practisedTargetIds,
          p_taught_units: a.taughtUnits,
        });
        if (error) dbError("eng_write_lesson_note_v3", error);
        return data;
      }
      const { data, error } = await db().rpc("eng_write_lesson_note_v2", {
        p_learner: a.learnerId,
        p_session_date: a.sessionDate,
        p_studied: a.studied,
        p_weak_tags: a.weakTags,
        p_message: a.message,
        p_note_for_parent: a.noteForParent,
        p_rechecks: a.rechecks,
        p_supersedes: a.supersedes,
        p_by: a.byMemberId,
        p_client_id: a.clientId,
        // Sent only when there is something to log: the call then also works against the previous (pre-0017) signature, so the code can be
        // deployed before the SQL is applied.
        ...(a.practisedTargetIds.length > 0 ? { p_practised_target_ids: a.practisedTargetIds } : {}),
      });
      if (error) dbError("eng_write_lesson_note_v2", error);
      return data;
    },
  };
}
