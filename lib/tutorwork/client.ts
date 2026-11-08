/** Browser-side helpers for the S5b-1 forms (no server-only imports). */
import { appFeedback, intakeCopy, teachingNotes, tutorWorkErrors } from "@/lib/copy/vi";

export type PostOk<T> = { ok: true; status: number; body: T };
export type PostFail = { ok: false; status: number; error: string };

/** POST JSON; never throws (a network failure becomes `{ok:false, status:0}`). */
export async function postJson<T = Record<string, unknown>>(url: string, payload: unknown): Promise<PostOk<T> | PostFail> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) return { ok: true, status: res.status, body: body as T };
    return {
      ok: false,
      status: res.status,
      error: typeof body.error === "string" ? body.error : "error",
    };
  } catch {
    return { ok: false, status: 0, error: "network" };
  }
}

/** One friendly sentence for a failed call. */
export function failText(r: PostFail): string {
  if (r.status === 0) return tutorWorkErrors.offline;
  if (r.error === "tutor_only") return tutorWorkErrors.classTutorOnly;
  if (r.error === "duplicate_first") return tutorWorkErrors.duplicateFirst;
  if (r.error === "duplicate_month") return tutorWorkErrors.duplicateMonth;
  if (r.error === "bad_month") return tutorWorkErrors.badMonth;
  if (r.error === "stale_report") return tutorWorkErrors.staleReport;
  if (r.error === "frame_other_learner") return tutorWorkErrors.frameOtherLearner;
  if (r.error === "unknown_group") return tutorWorkErrors.unknownGroup;
  if (r.error === "already_grouped") return tutorWorkErrors.alreadyGrouped;
  if (r.error === "level_tutor_only") return tutorWorkErrors.levelTutorOnly;
  if (r.error === "already_confirmed") return tutorWorkErrors.alreadyConfirmed;
  if (r.error === "needs_baseline") return tutorWorkErrors.needsBaseline;
  if (r.error === "same_level") return tutorWorkErrors.sameLevel;
  if (r.error === "reason_required") return tutorWorkErrors.reasonRequired;
  if (r.error === "bad_date") return tutorWorkErrors.badDate;
  if (r.error === "already_superseded") return tutorWorkErrors.alreadySuperseded;
  if (r.error === "teaching_tutor_only") return teachingNotes.readOnly;
  if (r.error === "feedback_parent_only") return appFeedback.parentOnly;
  if (r.error === "too_long") return teachingNotes.tooLong;
  if (r.error === "bad_content") return intakeCopy.badContent;
  if (r.error === "reply_required") return appFeedback.replyRequired;
  if (r.error === "client_id_reused") return appFeedback.clientReused;
  if (r.error === "skill_tutor_only") return tutorWorkErrors.skillTutorOnly;
  if (r.error === "already_answered") return tutorWorkErrors.alreadyAnswered;
  if (r.error === "stale_proposal") return tutorWorkErrors.staleProposal;
  if (r.error === "flag_not_bulk") return tutorWorkErrors.flagNotBulk;
  if (r.error === "flag_keep_or_edit") return tutorWorkErrors.flagKeepOrEdit;
  if (r.error === "not_a_proposal") return tutorWorkErrors.notAProposal;
  if (r.error === "manual_levels_1_2") return tutorWorkErrors.manualLevels;
  if (r.error === "not_in_set") return tutorWorkErrors.notInSet;
  if (r.error === "same_state") return tutorWorkErrors.sameState;
  if (r.error === "skill_reason_required") return tutorWorkErrors.skillReasonRequired;
  if (r.status === 403) return tutorWorkErrors.forbidden;
  if (r.status === 409) return tutorWorkErrors.conflict;
  if (r.status === 400) return tutorWorkErrors.invalid;
  return tutorWorkErrors.generic;
}
