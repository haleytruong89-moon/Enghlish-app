import { handleInbox } from "@/lib/review/handlers";
import { runReviewRoute } from "@/lib/review/route";

/** GET /api/review/inbox — submitted work of the children this person may review (parent / tutor only). */
export async function GET() {
  return runReviewRoute("GET /api/review/inbox", (deps) => handleInbox(deps));
}
