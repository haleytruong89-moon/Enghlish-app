import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleTagEpisode } from "@/lib/tutorwork/handlers";
import { runTutorWorkRoute } from "@/lib/tutorwork/route";

/** POST /api/review/episodes/:id/tags - up to 3 tags for a piece of writing (ACT-WRITE / ACT-REVISE) on the review screen. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runTutorWorkRoute("POST /api/review/episodes/[id]/tags", (deps) => handleTagEpisode(deps, id, body));
}
