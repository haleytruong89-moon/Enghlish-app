import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleDecisions } from "@/lib/review/handlers";
import { runReviewRoute } from "@/lib/review/route";

/** POST /api/review/episodes/:id/decisions — score one or more skills (0..4 or "no opportunity"); the database applies D15. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runReviewRoute("POST /api/review/episodes/[id]/decisions", (deps) => handleDecisions(deps, id, body));
}
