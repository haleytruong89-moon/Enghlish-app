import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { ReviewDbError } from "@/lib/review/handlers";
import { createSupabaseWorkStore } from "@/lib/work/supabaseStore";
import type { PracticeStore } from "./handlers";

function dbError(what: string, err: { code?: string; message?: string }): never {
  throw new ReviewDbError(err.code ?? "unknown", `${what}: ${err.message ?? err.code ?? "error"}`);
}

/**
 * Staff writes call the service-role functions of migration 0016 after the handler ran requireAccess (the SQL re-checks the actor).
 * What the STUDENT reads goes through the USER client and the eng_my_* functions, which check auth.uid() themselves: the service role
 * is never used to decide what a student sees. The student's submission is written by eng_submit_practice with the student's own
 * member id, which the handler took from the session (never from the request) and the SQL checks against the assignment's learner.
 */
export function createSupabasePracticeStore(): PracticeStore {
  const db = () => createAdminClient();
  return {
    getOwnProfile: (userId) => createSupabaseWorkStore().getOwnProfile(userId),

    async getAssignmentLearnerId(assignmentId) {
      const { data, error } = await db().from("assignments").select("learner_id").eq("id", assignmentId).maybeSingle<{ learner_id: string }>();
      if (error) dbError("assignments lookup", error);
      return data?.learner_id ?? null;
    },

    async getFile(fileId) {
      const { data, error } = await db()
        .from("files")
        .select("learner_id, path, mime, kind")
        .eq("id", fileId)
        .maybeSingle<{ learner_id: string | null; path: string; mime: string; kind: string }>();
      if (error) dbError("files lookup", error);
      return data ? { learnerId: data.learner_id, path: data.path, mime: data.mime, kind: data.kind } : null;
    },

    async overview(learnerId, assignmentId) {
      const { data, error } = await db().rpc("eng_assignment_overview", { p_learner: learnerId, p_assignment: assignmentId });
      if (error) dbError("eng_assignment_overview", error);
      return data;
    },

    async createAssignment(a) {
      const { data, error } = await db().rpc("eng_create_assignment", {
        p_learner: a.learnerId,
        p_kind: a.kind,
        p_url: a.url,
        p_title: a.title,
        p_tag_keys: a.tags,
        p_due_on: a.dueOn,
        p_frame: a.frameId,
        p_files: a.files ? { main: a.files.main, answer: a.files.answer } : null,
        p_by: a.byMemberId,
        p_client_id: a.clientId,
      });
      if (error) dbError("eng_create_assignment", error);
      return data;
    },

    async retractAssignment(a) {
      const { data, error } = await db().rpc("eng_retract_assignment", { p_assignment: a.assignmentId, p_reason: a.reason, p_by: a.byMemberId });
      if (error) dbError("eng_retract_assignment", error);
      return data;
    },

    async submit(a) {
      const { data, error } = await db().rpc("eng_submit_practice", {
        p_assignment: a.assignmentId,
        p_by: a.byMemberId,
        p_client_id: a.clientId,
        p_attempt: a.attempt,
        p_used_hint: a.usedHint,
        p_link_url: a.linkUrl,
        p_files: a.files.map((f) => ({ id: f.id, mime: f.mime, bytes: f.bytes })),
      });
      if (error) dbError("eng_submit_practice", error);
      return data;
    },

    async myPractice() {
      const c = await createUserClient();
      const { data, error } = await c.rpc("eng_my_practice");
      if (error) dbError("eng_my_practice", error);
      return data;
    },

    async myPracticeFile(assignmentId) {
      const c = await createUserClient();
      const { data, error } = await c.rpc("eng_my_practice_file", { p_assignment: assignmentId });
      if (error) dbError("eng_my_practice_file", error);
      return data ?? null;
    },

    async myReviewPoints() {
      const c = await createUserClient();
      const { data, error } = await c.rpc("eng_my_review_points");
      if (error) dbError("eng_my_review_points", error);
      return data ?? null;
    },
  };
}
