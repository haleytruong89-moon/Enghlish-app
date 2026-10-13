import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleModify } from "@/lib/review/handlers";
import { runReviewRoute } from "@/lib/review/route";

/** POST /api/review/decisions/:id/modify — replace a decision with a new one (reason required); the old one stays in the history. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runReviewRoute("POST /api/review/decisions/[id]/modify", (deps) => handleModify(deps, id, body));
}
