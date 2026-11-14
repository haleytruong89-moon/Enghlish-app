import "server-only";
import { ReviewDbError } from "@/lib/review/handlers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingFunction } from "./errors";
import type { RoadmapStore } from "./handlers";

function dbError(what: string, err: { code?: string; message?: string }): never {
  // Before migration 0032 is applied the functions are missing: one clear answer instead of a 500.
  if (isMissingFunction(err.code)) throw new ReviewDbError("roadmap_unavailable", `${what} is missing: apply migration 0032`);
  throw new ReviewDbError(err.code ?? "unknown", `${what}: ${err.message ?? err.code ?? "error"}`);
}

/** Writes call the service-role functions of migration 0032, only after the handler ran requireAccess; the SQL checks the actor again. */
export function createSupabaseRoadmapStore(): RoadmapStore {
  const db = () => createAdminClient();
  return {
    async writeMilestone(a) {
      const f = a.fields;
      const { data, error } = await db().rpc("eng_roadmap_write", {
        p_learner: a.learnerId, p_milestone: a.milestoneId, p_base_version: a.baseVersion,
        p_fields: f === null ? null : { kind: f.kind, role: f.role, title: f.title, curriculum_id: f.curriculum_id ?? null, after_unit: f.after_unit ?? null, target_month: f.target_month ?? null, approx: f.approx ?? false },
        p_status: a.status, p_reason: a.reason, p_proposal_key: a.proposalKey, p_by: a.byMemberId, p_client_id: a.clientId,
      });
      if (error) dbError("eng_roadmap_write", error);
      return data;
    },
    async setMain(a) {
      const { data, error } = await db().rpc("eng_roadmap_set_main", { p_learner: a.learnerId, p_curriculum: a.curriculumId, p_by: a.byMemberId, p_client_id: a.clientId });
      if (error) dbError("eng_roadmap_set_main", error);
      return data;
    },
  };
}
