import { apiErrors } from "@/lib/copy/vi";
import { fromDbError, ReviewDbError, type HandlerResult } from "@/lib/review/handlers";

/** The tags the SQL functions put in parentheses at the end of their messages (migration 0030). */
const TAGS = ["bad_date", "bad_party", "too_long", "reason_required", "already_cancelled", "bad_absence", "not_current", "bad_kind", "kind_on_edit", "client_id_reused", "absence_exists", "absence_already_made_up"] as const;

/** "Function is missing" = migration 0030 is not applied yet (PostgREST PGRST202, Postgres 42883). */
export const isMissingFunction = (code?: string): boolean => code === "PGRST202" || code === "42883";

/** Maps a database error of the session functions to a short code the form turns into words; anything else falls back to the shared mapping. */
export function sessionError(err: unknown): HandlerResult {
  if (err instanceof ReviewDbError) {
    if (err.code === "sessions_unavailable") return { status: 409, body: { error: "sessions_unavailable", message: apiErrors[409] } };
    const tag = TAGS.find((t) => err.detail.includes(`(${t})`));
    if (tag) {
      const status = err.code === "23505" ? 409 : err.code === "42501" ? 403 : 400;
      return { status, body: { error: tag, message: apiErrors[status] } };
    }
  }
  return fromDbError(err);
}
