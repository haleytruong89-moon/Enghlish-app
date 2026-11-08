// lib/import/supabaseStore.ts
import "server-only";
import { ReviewDbError } from "@/lib/review/handlers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ImportStore } from "./handlers";

const PURPOSE = "read_answers";

/** The import functions of migration 0027 through the service role; only after the handler ran requireAccess. */
export function createSupabaseImportStore(): ImportStore {
  const call = async (fn: string, args: Record<string, unknown>): Promise<unknown> => {
    const { data, error } = await createAdminClient().rpc(fn, args);
    if (error) throw new ReviewDbError(error.code ?? "unknown", `${fn}: ${error.message ?? error.code ?? "error"}`);
    return data;
  };
  return {
    async getImportLearnerId(id) {
      const { data, error } = await createAdminClient().from("import_batches").select("learner_id").eq("id", id).maybeSingle<{ learner_id: string }>();
      if (error) throw new ReviewDbError(error.code ?? "unknown", `import_batches lookup: ${error.message ?? error.code ?? "error"}`);
      return data?.learner_id ?? null;
    },
    issueUploadTicket: (a) => call("eng_issue_upload_ticket", { p_learner: a.learnerId, p_by: a.byMemberId }),
    aiGate: (l) => call("eng_ai_gate", { p_learner: l }),
    aiReserve: (a) =>
      call("eng_ai_gate", { p_learner: a.learnerId, p_estimate: a.estimateUsd, p_reserve: true, p_draft: a.batchId, p_model: a.model, p_by: a.byMemberId, p_purpose: PURPOSE }),
    logAiRun: async (r) =>
      String(
        await call("eng_log_ai_run", {
          p_family: r.familyId, p_draft: r.draftId, p_model: r.model, p_prompt_version: r.promptVersion, p_input: r.inputTokens, p_output: r.outputTokens,
          p_cost: r.costUsd, p_status: r.status, p_error: r.errorCode, p_by: r.byMemberId, p_release: r.releasesRunId, p_purpose: PURPOSE,
        }),
      ),
    create: (a) =>
      call("eng_create_import", {
        p_learner: a.learnerId, p_title: a.title, p_work_file: a.workFile, p_key_file: a.keyFile, p_taken_on: a.takenOn, p_support: a.supportLevel,
        p_source_hash: a.sourceHash, p_by: a.byMemberId, p_client_id: a.clientId, p_allow_other: a.allowOther, p_manual: a.manual,
      }),
    async files(batchId) {
      const db = createAdminClient();
      const b = await db.from("import_batches").select("work_file_id, key_file_id").eq("id", batchId).maybeSingle<{ work_file_id: string; key_file_id: string }>();
      if (b.error) throw new ReviewDbError(b.error.code ?? "unknown", `import_batches lookup: ${b.error.message ?? b.error.code ?? "error"}`);
      if (!b.data) return null;
      const f = await db.from("files").select("id, path, mime").in("id", [b.data.work_file_id, b.data.key_file_id]);
      if (f.error) throw new ReviewDbError(f.error.code ?? "unknown", `files lookup: ${f.error.message ?? f.error.code ?? "error"}`);
      const by = new Map((f.data as { id: string; path: string; mime: string }[]).map((x) => [x.id, x]));
      const work = by.get(b.data.work_file_id);
      const key = by.get(b.data.key_file_id);
      return work && key ? { work: { path: work.path, mime: work.mime }, key: { path: key.path, mime: key.mime } } : null;
    },
    retry: (a) => call("eng_retry_import_read", { p_batch: a.batchId, p_by: a.byMemberId, p_to: a.to }),
    batch: (id) => call("eng_import_batch", { p_batch: id }),
    finish: (a) => call("eng_finish_import_read", { p_batch: a.batchId, p_payload: a.payload, p_run: a.runId }),
    fail: (a) => call("eng_fail_import_read", { p_batch: a.batchId, p_error: a.errorCode, p_run: a.runId }),
    discard: (a) => call("eng_discard_import", { p_batch: a.batchId, p_by: a.byMemberId }),
    confirm: (a) => call("eng_confirm_import", { p_batch: a.batchId, p_base: a.base, p_build: a.build, p_by: a.byMemberId, p_client_id: a.clientId }),
  };
}
