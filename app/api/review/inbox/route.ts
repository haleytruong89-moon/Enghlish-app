import { handleInbox } from "@/lib/review/handlers";
import { runReviewRoute } from "@/lib/review/route";

/**
 * GET /api/review/inbox - submitted work of the children this person may review (parent / tutor only).
 * Query: filter (default todo), limit (1-100, default 50), after_at + after_id (cursor = `next` of the previous page).
 * Answer: { items, next, counts }.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return runReviewRoute("GET /api/review/inbox", (deps) =>
    handleInbox(deps, { filter: q.get("filter"), limit: q.get("limit"), after_at: q.get("after_at"), after_id: q.get("after_id") }),
  );
}
