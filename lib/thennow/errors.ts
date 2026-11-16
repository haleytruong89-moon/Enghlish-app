import { apiErrors } from "@/lib/copy/vi";
import { fromDbError, ReviewDbError, type HandlerResult } from "@/lib/review/handlers";

/** The tags the SQL function of migration 0036 puts in parentheses at the end of its messages. */
const TAGS = ["tutor_only", "bad_pick", "score_words", "too_long", "bad_status", "bad_client_id", "client_id_reused"] as const;

/** "Function is missing" = migration 0036 is not applied yet (PostgREST PGRST202, Postgres 42883). */
export const isMissingFunction = (code?: string): boolean => code === "PGRST202" || code === "42883";

export function thenNowError(err: unknown): HandlerResult {
  if (err instanceof ReviewDbError) {
    if (err.code === "thennow_unavailable") return { status: 409, body: { error: "thennow_unavailable", message: apiErrors[409] } };
    const tag = TAGS.find((t) => err.detail.includes(`(${t})`));
    if (tag) {
      const status = err.code === "23505" ? 409 : err.code === "42501" ? 403 : 400;
      return { status, body: { error: tag, message: apiErrors[status] } };
    }
  }
  return fromDbError(err);
}
