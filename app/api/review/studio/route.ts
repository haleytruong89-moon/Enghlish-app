// app/api/review/studio/route.ts
import { handlePending } from "@/lib/studio/handlers";
import { runStudioRoute } from "@/lib/studio/route";

/** GET /api/review/studio - Studio items waiting for a person ("Cần thầy/cô xem"). */
export async function GET() {
  return runStudioRoute("GET /api/review/studio", (deps) => handlePending(deps));
}
