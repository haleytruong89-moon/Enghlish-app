import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { InquiryDbError, type InquiryStore } from "./handlers";
import { withoutImported, type ActivityRow, type EventRow, type InstanceRow, type TemplateRow } from "./view";

function dbError(what: string, err: { code?: string; message?: string }): never {
  throw new InquiryDbError(err.code ?? "unknown", `${what}: ${err.code ?? "error"}`);
}

/**
 * Reads use the USER client (RLS applies on top of requireAccess); writes call the SECURITY DEFINER
 * functions with the service role, and only after the handler has run requireAccess.
 * No method reads the staff-only key or transcript tables: keys cannot leak through here.
 */
export function createSupabaseInquiryStore(): InquiryStore {
  return {
    async listPublishedTemplates(trackId) {
      const db = await createUserClient();
      const { data, error } = await db
        .from("inquiry_templates")
        .select("id, version, title_vi, big_question_en, big_question_vi, week, date_from, date_to, domain_bucket, steps")
        .eq("track_id", trackId)
        // Studio tests are assigned from their own page (Studio B1), never from "Giao chủ đề".
        .eq("kind", "topic")
        .not("published_at", "is", null)
        .returns<TemplateRow[]>();
      if (error) dbError("inquiry_templates lookup", error);
      return data ?? [];
    },

    async listInstances(learnerId) {
      const db = await createUserClient();
      const [inst, acts, evs] = await Promise.all([
        db
          .from("inquiry_instances")
          .select("id, template_id, template_version, snapshot, assigned_at, due_on")
          .eq("learner_id", learnerId)
          .returns<InstanceRow[]>(),
        db
          .from("activity_instances")
          .select("id, inquiry_instance_id, step_no, activity_type, mode, purpose, target_ids, scheduled_for")
          .eq("learner_id", learnerId)
          .returns<ActivityRow[]>(),
        db
          .from("activity_instance_events")
          .select("id, activity_instance_id, kind, new_date, reason, at")
          .eq("learner_id", learnerId)
          .returns<EventRow[]>(),
      ]);
      if (inst.error) dbError("inquiry_instances lookup", inst.error);
      if (acts.error) dbError("activity_instances lookup", acts.error);
      if (evs.error) dbError("activity_instance_events lookup", evs.error);
      return withoutImported({
        instances: inst.data ?? [],
        activities: acts.data ?? [],
        // bigint identity may arrive as a string in some drivers
        events: (evs.data ?? []).map((e) => ({ ...e, id: Number(e.id) })),
      });
    },

    async assign(args) {
      const { data, error } = await createAdminClient().rpc("eng_assign_inquiry", {
        p_learner: args.learnerId,
        p_template: args.template_id,
        p_version: args.version,
        p_due: args.due_on,
        p_by: args.byMemberId,
        p_client_request_id: args.client_request_id,
      });
      if (error) dbError("eng_assign_inquiry", error);
      return String(data);
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

    async recordEvent(args) {
      const { data, error } = await createAdminClient().rpc("eng_activity_event", {
        p_activity: args.activityId,
        p_kind: args.kind,
        p_new_date: args.new_date ?? null,
        p_reason: args.reason,
        p_by: args.byMemberId,
      });
      if (error) dbError("eng_activity_event", error);
      return Number(data);
    },
  };
}
