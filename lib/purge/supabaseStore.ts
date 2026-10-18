import "server-only";
import { ReviewDbError } from "@/lib/review/handlers";
import { deleteLearnerFolder } from "@/lib/storage/purge";
import { createFileStorage } from "@/lib/storage/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PurgeStore } from "./handlers";
import { parsePurgePreview, type PurgePreview } from "./shape";

function dbError(what: string, err: { code?: string; message?: string }): never {
  throw new ReviewDbError(err.code ?? "unknown", `${what}: ${err.message ?? err.code ?? "error"}`);
}

/** Service-role calls to the purge functions (migrations 0010-0017). Only used AFTER requireAccess(…, "admin"). */
export function createSupabasePurgeStore(): PurgeStore {
  return {
    async purge({ learnerId, actorUserId }) {
      const { data, error } = await createAdminClient().rpc("eng_purge_learner", { p_learner_id: learnerId, p_actor_user_id: actorUserId });
      if (error) dbError("eng_purge_learner", error);
      return data;
    },
    removeFiles: ({ familyId, learnerId }) => deleteLearnerFolder(createFileStorage(), familyId, learnerId),
    async auditFiles({ familyId, learnerId, actorUserId, removed }) {
      const { error } = await createAdminClient().rpc("eng_audit_purge_files", {
        p_family: familyId,
        p_learner: learnerId,
        p_actor_user: actorUserId,
        p_removed: removed,
      });
      if (error) dbError("eng_audit_purge_files", error);
    },
  };
}

/** The dry run: how many rows of each kind would be deleted. Read-only (counts only). Call after requireAccess(…, "admin"). */
export async function loadPurgePreview(learnerId: string): Promise<PurgePreview> {
  const { data, error } = await createAdminClient().rpc("eng_purge_preview", { p_learner: learnerId });
  if (error) throw new Error(`eng_purge_preview failed: ${error.code ?? error.message}`);
  return parsePurgePreview(data);
}
