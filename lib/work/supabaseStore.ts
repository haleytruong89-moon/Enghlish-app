import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/auth/requireAccess";
import { WorkDbError, type WorkStore } from "./handlers";

function dbError(what: string, err: { code?: string; message?: string }): never {
  throw new WorkDbError(err.code ?? "unknown", `${what}: ${err.code ?? "error"}`);
}

/** Like dbError, but keeps the database message: the S6 handlers read the "(tag)" at its end. It is never sent to the browser. */
function dbErrorWithTag(what: string, err: { code?: string; message?: string }): never {
  throw new WorkDbError(err.code ?? "unknown", `${what}: ${err.message ?? err.code ?? "error"}`);
}

/**
 * Scope lookups use the admin client (read-only, and only to decide which learner a request is about —
 * requireAccess then decides). Everything the student sees or writes goes through the USER client and the
 * security-definer english.eng_* functions, which check auth.uid() themselves: the service role is never used for it.
 */
export function createSupabaseWorkStore(): WorkStore {
  return {
    async getOwnProfile(userId) {
      const admin = createAdminClient();
      const { data: member, error } = await admin
        .from("members")
        .select("id, role")
        .eq("user_id", userId)
        .maybeSingle<{ id: string; role: Role }>();
      if (error) dbError("members lookup", error);
      if (!member) return null;
      if (member.role !== "student") return { role: member.role, learnerId: null };
      const { data: learner, error: lerr } = await admin
        .from("learners")
        .select("id")
        .eq("member_id", member.id)
        .maybeSingle<{ id: string }>();
      if (lerr) dbError("learners lookup", lerr);
      return { role: member.role, learnerId: learner?.id ?? null };
    },

    async getActivityLearnerId(activityId) {
      const { data, error } = await createAdminClient()
        .from("activity_instances")
        .select("learner_id")
        .eq("id", activityId)
        .maybeSingle<{ learner_id: string }>();
      if (error) dbError("activity_instances lookup", error);
      return data?.learner_id ?? null;
    },

    async getHome() {
      const db = await createUserClient();
      const { data, error } = await db.rpc("eng_my_home");
      if (error) dbError("eng_my_home", error);
      return data;
    },

    async getReviewByDomain() {
      const db = await createUserClient();
      const { data, error } = await db.rpc("eng_my_review_by_domain");
      if (error) dbError("eng_my_review_by_domain", error);
      return data;
    },

    async getMyFeedback() {
      const db = await createUserClient();
      const { data, error } = await db.rpc("eng_my_feedback");
      if (error) dbError("eng_my_feedback", error);
      return data;
    },

    async getMyActivityNote(activityId) {
      const db = await createUserClient();
      const { data, error } = await db.rpc("eng_my_activity_note", { p_activity: activityId });
      if (error) dbError("eng_my_activity_note", error);
      return data ?? null;
    },

    async getMyRevision(activityId) {
      const db = await createUserClient();
      const { data, error } = await db.rpc("eng_my_revision", { p_activity: activityId });
      if (error) dbError("eng_my_revision", error);
      return data ?? null;
    },

    async saveRevisionDraft({ activityId, content, baseRevision }) {
      const db = await createUserClient();
      const { data, error } = await db.rpc("eng_save_revision_draft", { p_activity: activityId, p_content: content, p_base_revision: baseRevision });
      if (error) dbErrorWithTag("eng_save_revision_draft", error);
      return data;
    },

    async submitRevision({ activityId, clientSubmissionId, feedbackId, text, marks, assistance, provenance }) {
      const db = await createUserClient();
      const { data, error } = await db.rpc("eng_submit_revision", {
        p_activity: activityId, p_client_id: clientSubmissionId, p_text: text, p_marks: marks, p_assistance: assistance, p_provenance: provenance, p_feedback: feedbackId,
      });
      if (error) dbErrorWithTag("eng_submit_revision", error);
      return data;
    },

    async getActivity(activityId) {
      const db = await createUserClient();
      const { data, error } = await db.rpc("eng_my_activity", { p_activity: activityId });
      if (error) dbError("eng_my_activity", error);
      return data ?? null;
    },

    async getSources(activityId) {
      const db = await createUserClient();
      const { data, error } = await db.rpc("eng_my_step_sources", { p_activity: activityId });
      if (error) dbError("eng_my_step_sources", error);
      return data ?? null;
    },

    async saveDraft({ activityId, content, baseRevision }) {
      const db = await createUserClient();
      const { data, error } = await db.rpc("eng_save_draft", {
        p_activity: activityId,
        p_content: content,
        p_base_revision: baseRevision,
      });
      if (error) dbError("eng_save_draft", error);
      return data;
    },

    async submit({ activityId, clientSubmissionId, content, assistance, provenance }) {
      const db = await createUserClient();
      const { data, error } = await db.rpc("eng_submit_attempt", {
        p_activity: activityId,
        p_client_id: clientSubmissionId,
        p_content: content,
        p_assistance: assistance,
        p_provenance: provenance,
      });
      if (error) dbError("eng_submit_attempt", error);
      return data;
    },
  };
}
