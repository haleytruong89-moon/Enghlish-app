import "server-only";
import { ReviewDbError } from "@/lib/review/handlers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StudioStore } from "./handlers";

/** Studio functions of migration 0024 through the service role; only after the handler ran requireAccess / requireStaff. */
export function createSupabaseStudioStore(): StudioStore {
  const call = async (fn: string, args: Record<string, unknown>): Promise<unknown> => {
    const { data, error } = await createAdminClient().rpc(fn, args);
    if (error) throw new ReviewDbError(error.code ?? "unknown", `${fn}: ${error.message ?? error.code ?? "error"}`);
    return data;
  };
  const learnerOf = async (table: "studio_drafts" | "attempts", id: string) => {
    const { data, error } = await createAdminClient().from(table).select("learner_id").eq("id", id).maybeSingle<{ learner_id: string }>();
    if (error) throw new ReviewDbError(error.code ?? "unknown", `${table} lookup: ${error.message ?? error.code ?? "error"}`);
    return data?.learner_id ?? null;
  };
  return {
    getDraftLearnerId: (id) => learnerOf("studio_drafts", id),
    getAttemptLearnerId: (id) => learnerOf("attempts", id),
    issueUploadTicket: (a) => call("eng_issue_upload_ticket", { p_learner: a.learnerId, p_by: a.byMemberId }),
    aiGate: (l) => call("eng_ai_gate", { p_learner: l }),
    aiReserve: (a) =>
      call("eng_ai_gate", { p_learner: a.learnerId, p_estimate: a.estimateUsd, p_reserve: true, p_draft: a.draftId, p_model: a.model, p_by: a.byMemberId }),
    aiSettings: (m) => call("eng_ai_settings", { p_by: m }),
    setAiSettings: (a) => call("eng_set_ai_settings", { p_enabled: a.enabled, p_notice_version: a.noticeVersion, p_by: a.byMemberId }),
    logAiRun: async (r) =>
      String(
        await call("eng_log_ai_run", {
          p_family: r.familyId, p_draft: r.draftId, p_model: r.model, p_prompt_version: r.promptVersion, p_input: r.inputTokens, p_output: r.outputTokens,
          p_cost: r.costUsd, p_status: r.status, p_error: r.errorCode, p_by: r.byMemberId, p_release: r.releasesRunId,
        }),
      ),
    createDraft: (a) =>
      call("eng_create_studio_draft", { p_learner: a.learnerId, p_title: a.title, p_test_file: a.testFile, p_key_file: a.keyFile, p_extract: a.extract, p_by: a.byMemberId, p_client_id: a.clientId }),
    editDraft: (a) => call("eng_edit_studio_draft", { p_draft: a.draftId, p_by: a.byMemberId, p_client_id: a.clientId }),
    draft: (id) => call("eng_studio_draft", { p_draft: id }),
    drafts: (l) => call("eng_studio_drafts", { p_learner: l }),
    saveDraft: (a) => call("eng_save_studio_draft", { p_draft: a.draftId, p_title: a.title, p_payload: a.payload, p_base: a.base, p_by: a.byMemberId }),
    finishExtraction: (a) => call("eng_finish_studio_extraction", { p_draft: a.draftId, p_payload: a.payload, p_run: a.runId }),
    failExtraction: (a) => call("eng_fail_studio_extraction", { p_draft: a.draftId, p_error: a.errorCode, p_run: a.runId }),
    discardDraft: (a) => call("eng_discard_studio_draft", { p_draft: a.draftId, p_by: a.byMemberId }),
    approveDraft: (a) => call("eng_approve_studio_draft", { p_draft: a.draftId, p_base: a.base, p_build: a.build, p_by: a.byMemberId }),
    assign: (a) => call("eng_assign_studio", { p_draft: a.draftId, p_start: a.startOn, p_due: a.dueOn, p_by: a.byMemberId, p_client_id: a.clientId }),
    retryResults: (m) => call("eng_studio_retry_results", { p_by: m }),
    pending: (a) => call("eng_studio_pending", { p_by: a.byMemberId, p_allow_real: a.allowReal }),
    decide: (a) => call("eng_decide_studio_items", { p_attempt: a.attemptId, p_items: a.items, p_by: a.byMemberId, p_client_id: a.clientId }),
  };
}
