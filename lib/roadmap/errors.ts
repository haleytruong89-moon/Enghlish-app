import { apiErrors } from "@/lib/copy/vi";
import { fromDbError, ReviewDbError, type HandlerResult } from "@/lib/review/handlers";

/** The tags the SQL functions of migration 0031 put in parentheses at the end of their messages. */
const TAGS = ["tutor_only", "stale_version", "summit_exists", "bad_unit", "bad_fields", "reason_required", "proposal_used", "already_removed", "bad_curriculum", "client_id_reused"] as const;

/** "Function is missing" = migration 0031 is not applied yet (PostgREST PGRST202, Postgres 42883). */
export const isMissingFunction = (code?: string): boolean => code === "PGRST202" || code === "42883";

/** Maps a database error of the roadmap functions to a short code the form turns into words; anything else falls back to the shared mapping. */
export function roadmapError(err: unknown): HandlerResult {
  if (err instanceof ReviewDbError) {
    if (err.code === "roadmap_unavailable") return { status: 409, body: { error: "roadmap_unavailable", message: apiErrors[409] } };
    const tag = TAGS.find((t) => err.detail.includes(`(${t})`));
    if (tag) {
      const status = err.code === "23505" ? 409 : err.code === "42501" ? 403 : 400;
      return { status, body: { error: tag, message: apiErrors[status] } };
    }
  }
  return fromDbError(err);
}
