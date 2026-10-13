import type { NextRequest } from "next/server";
import { handleEpisode } from "@/lib/review/handlers";
import { runReviewRoute } from "@/lib/review/route";

/** GET /api/review/episodes/:id — the work, the step, the rubric per skill, keys (staff only), decisions with history. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runReviewRoute("GET /api/review/episodes/[id]", (deps) => handleEpisode(deps, id));
}
