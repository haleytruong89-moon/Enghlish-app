import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleTagResultItems } from "@/lib/tutorwork/handlers";
import { runTutorWorkRoute } from "@/lib/tutorwork/route";

/** POST /api/results/:id/tags - tag the wrong items of a result that still have no tag (tutor first, parent as fallback). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runTutorWorkRoute("POST /api/results/[id]/tags", (deps) => handleTagResultItems(deps, id, body));
}
