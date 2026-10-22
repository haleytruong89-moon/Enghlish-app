import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleAddTag } from "@/lib/tutorwork/handlers";
import { runTutorWorkRoute } from "@/lib/tutorwork/route";

/** POST /api/learners/:id/tags - add a tag of the family's own ("+ nhãn khác") into a group of the skill map. The same name as an existing tag returns that tag. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runTutorWorkRoute("POST /api/learners/[id]/tags", (deps) => handleAddTag(deps, id, body));
}
