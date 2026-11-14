import "server-only";
import { ReviewDbError } from "@/lib/review/handlers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingFunction } from "./errors";
import type { SessionsStore } from "./handlers";

function dbError(what: string, err: { code?: string; message?: string }): never {
  // Before migration 0030 is applied the functions are missing: one clear answer instead of a 500.
  if (isMissingFunction(err.code)) throw new ReviewDbError("sessions_unavailable", `${what} is missing: apply migration 0030`);
  throw new ReviewDbError(err.code ?? "unknown", `${what}: ${err.message ?? err.code ?? "error"}`);
}

async function learnerOf(table: string, id: string): Promise<string | null> {
  const { data, error } = await createAdminClient().from(table).select("learner_id").eq("id", id).maybeSingle<{ learner_id: string }>();
  if (error) throw new ReviewDbError(error.code ?? "unknown", `${table} lookup: ${error.message ?? "error"}`);
  return data?.learner_id ?? null;
}

/** Writes call the service-role functions of migration 0030, only after the handler ran requireAccess; the SQL checks the actor again. */
export function createSupabaseSessionsStore(): SessionsStore {
  const db = () => createAdminClient();
  return {
    getNoteLearnerId: (id) => learnerOf("lesson_notes", id),
    // table missing (0030 not applied) = same "unavailable" answer
    getAbsenceLearnerId: async (id) => {
      try {
        return await learnerOf("session_absences", id);
      } catch (err) {
        if (err instanceof ReviewDbError && (err.code === "42P01" || err.code === "PGRST205")) throw new ReviewDbError("sessions_unavailable", "session_absences is missing");
        throw err;
      }
    },
    async recordAbsence(a) {
      const { data, error } = await db().rpc("eng_record_absence", {
        p_learner: a.learnerId, p_absent_on: a.absentOn, p_requested_by: a.requestedBy, p_billable: a.billable, p_note: a.note, p_by: a.byMemberId, p_client_id: a.clientId,
      });
      if (error) dbError("eng_record_absence", error);
      return data;
    },
    async cancelAbsence(a) {
      const { data, error } = await db().rpc("eng_cancel_absence", { p_absence: a.absenceId, p_reason: a.reason, p_by: a.byMemberId, p_client_id: a.clientId });
      if (error) dbError("eng_cancel_absence", error);
      return data;
    },
    async markSession(a) {
      const { data, error } = await db().rpc("eng_mark_session", {
        p_note: a.noteId, p_kind: a.kind, p_makeup_for: a.makeupFor, p_reason: a.reason, p_by: a.byMemberId, p_client_id: a.clientId,
      });
      if (error) dbError("eng_mark_session", error);
      return data;
    },
  };
}
