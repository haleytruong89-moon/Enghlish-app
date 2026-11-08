import "server-only";
import { ReviewDbError } from "@/lib/review/handlers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CurriculumStore } from "./handlers";

const PURPOSE = "curriculum_toc";

/** Curriculum functions of migration 0026 through the service role; only after the handler ran requireAccess. */
export function createSupabaseCurriculumStore(): CurriculumStore {
  const call = async (fn: string, args: Record<string, unknown>): Promise<unknown> => {
    const { data, error } = await createAdminClient().rpc(fn, args);
    if (error) throw new ReviewDbError(error.code ?? "unknown", `${fn}: ${error.message ?? error.code ?? "error"}`);
    return data;
  };
  const one = async <T>(table: string, columns: string, id: string): Promise<T | null> => {
    const { data, error } = await createAdminClient().from(table).select(columns).eq("id", id).maybeSingle<T>();
    if (error) throw new ReviewDbError(error.code ?? "unknown", `${table} lookup: ${error.message ?? error.code ?? "error"}`);
    return data ?? null;
  };
  return {
    getCurriculum: (id) => one<{ learner_id: string; title: string; level_note: string | null }>("curricula", "learner_id, title, level_note", id),
    getVersionLearnerId: async (id) => (await one<{ learner_id: string }>("curriculum_versions", "learner_id", id))?.learner_id ?? null,
    issueUploadTicket: (a) => call("eng_issue_upload_ticket", { p_learner: a.learnerId, p_by: a.byMemberId }),
    aiGate: (l) => call("eng_ai_gate", { p_learner: l }),
    aiReserve: (a) =>
      call("eng_ai_gate", { p_learner: a.learnerId, p_estimate: a.estimateUsd, p_reserve: true, p_draft: a.versionId, p_model: a.model, p_by: a.byMemberId, p_purpose: PURPOSE }),
    logAiRun: async (r) =>
      String(
        await call("eng_log_ai_run", {
          p_family: r.familyId, p_draft: r.draftId, p_model: r.model, p_prompt_version: r.promptVersion, p_input: r.inputTokens, p_output: r.outputTokens,
          p_cost: r.costUsd, p_status: r.status, p_error: r.errorCode, p_by: r.byMemberId, p_release: r.releasesRunId, p_purpose: PURPOSE,
        }),
      ),
    create: (a) =>
      call("eng_create_curriculum", {
        p_learner: a.learnerId, p_title: a.title, p_level_note: a.levelNote, p_toc_file: a.tocFile, p_extract: a.extract, p_by: a.byMemberId, p_client_id: a.clientId,
      }),
    addVersion: (a) => call("eng_add_curriculum_version", { p_curriculum: a.curriculumId, p_toc_file: a.tocFile, p_extract: a.extract, p_by: a.byMemberId, p_client_id: a.clientId }),
    edit: (a) => call("eng_edit_curriculum", { p_curriculum: a.curriculumId, p_by: a.byMemberId, p_client_id: a.clientId }),
    async version(id) {
      const db = createAdminClient();
      const v = await one<{ curriculum_id: string }>(
        "curriculum_versions",
        "id, curriculum_id, learner_id, version, source, status, payload, ai_payload, error_code, updated_at, approved_at, review, created_at",
        id,
      );
      if (!v) throw new ReviewDbError("P0002", "curriculum_versions: version not found");
      const c = await one("curricula", "id, learner_id, title, level_note", v.curriculum_id);
      // Cost of every call made for this version (retries included), the reservations themselves excluded.
      const { data: runs, error } = await db.from("ai_runs").select("cost_usd").eq("draft_id", id).eq("purpose", PURPOSE).in("status", ["ok", "error"]);
      if (error) throw new ReviewDbError(error.code ?? "unknown", `ai_runs lookup: ${error.message ?? "error"}`);
      const cost = (runs ?? []).reduce((n, r) => n + Number((r as { cost_usd: number | string }).cost_usd), 0);
      return { version: v, curriculum: c, ai_cost_usd: Math.round(cost * 1e6) / 1e6 };
    },
    save: (a) => call("eng_save_curriculum_draft", { p_version: a.versionId, p_payload: a.payload, p_base: a.base, p_by: a.byMemberId }),
    finish: (a) => call("eng_finish_curriculum_extraction", { p_version: a.versionId, p_payload: a.payload, p_run: a.runId }),
    fail: (a) => call("eng_fail_curriculum_extraction", { p_version: a.versionId, p_error: a.errorCode, p_run: a.runId }),
    discard: (a) => call("eng_discard_curriculum_draft", { p_version: a.versionId, p_by: a.byMemberId }),
    approve: (a) => call("eng_approve_curriculum_version", { p_version: a.versionId, p_base: a.base, p_units: a.units, p_review: a.review, p_by: a.byMemberId }),
    setUnitStatus: (a) =>
      call("eng_set_unit_status", {
        p_curriculum: a.curriculumId, p_unit_code: a.unitCode, p_status: a.status, p_lesson_note: a.lessonNoteId, p_by: a.byMemberId, p_client_id: a.clientId,
      }),
  };
}
