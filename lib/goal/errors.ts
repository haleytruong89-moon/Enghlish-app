import { apiErrors } from "@/lib/copy/vi";
import { fromDbError, ReviewDbError, type HandlerResult } from "@/lib/review/handlers";

/** The tags the SQL functions of migration 0035 put in parentheses at the end of their messages. */
const TAGS = ["tutor_only", "out_of_range", "pending_exists", "bad_ref", "bad_pieces", "bad_action", "already_answered", "client_id_reused"] as const;
export type GoalErrorCode = (typeof TAGS)[number] | "goal_unavailable";

/** "Function is missing" = migration 0035 is not applied yet (PostgREST PGRST202, Postgres 42883). */
export const isMissingFunction = (code?: string): boolean => code === "PGRST202" || code === "42883";

/** Maps a database error of the goal functions to a short code the screens turn into words; anything else falls back to the shared mapping. */
export function goalError(err: unknown): HandlerResult {
  if (err instanceof ReviewDbError) {
    if (err.code === "goal_unavailable") return { status: 409, body: { error: "goal_unavailable", message: apiErrors[409] } };
    const tag = TAGS.find((t) => err.detail.includes(`(${t})`));
    // An untagged 23505 can only come from the unique index on responds_to (a second answer to one proposal): the same message as the tagged case.
    if (!tag && err.code === "23505") return { status: 409, body: { error: "already_answered", message: apiErrors[409] } };
    if (tag) {
      const status = err.code === "23505" ? 409 : err.code === "42501" ? 403 : 400;
      return { status, body: { error: tag, message: apiErrors[status] } };
    }
  }
  return fromDbError(err);
}
