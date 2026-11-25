import { apiErrors } from "@/lib/copy/vi";
import { fromDbError, ReviewDbError, type HandlerResult } from "@/lib/review/handlers";

/** The tags the SQL function of migration 0043 puts in parentheses at the end of its messages. */
const TAGS = ["bad_kind", "bad_decision", "reason_required", "reason_too_long", "bad_card", "bad_label", "bad_evidence", "not_found", "client_id_reused"] as const;

/** "Function is missing" = migration 0043 is not applied yet (PostgREST PGRST202, Postgres 42883). */
export const isMissingFunction = (code?: string): boolean => code === "PGRST202" || code === "42883";

export function actionCardError(err: unknown): HandlerResult {
  if (err instanceof ReviewDbError) {
    if (err.code === "cards_unavailable") return { status: 409, body: { error: "cards_unavailable", message: apiErrors[409] } };
    const tag = TAGS.find((t) => err.detail.includes(`(${t})`));
    if (tag) {
      const status = tag === "not_found" ? 404 : tag === "client_id_reused" ? 409 : 400;
      return { status, body: { error: tag, message: apiErrors[status] } };
    }
  }
  return fromDbError(err);
}
