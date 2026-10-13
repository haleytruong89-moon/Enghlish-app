import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleSupport } from "@/lib/review/handlers";
import { runReviewRoute } from "@/lib/review/route";

/** POST /api/review/attempts/:id/support — add support the reviewer saw (separate from the score). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runReviewRoute("POST /api/review/attempts/[id]/support", (deps) => handleSupport(deps, id, body));
}
