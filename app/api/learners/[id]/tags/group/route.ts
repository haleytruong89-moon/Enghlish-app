import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleSetTagGroup } from "@/lib/tutorwork/handlers";
import { runTutorWorkRoute } from "@/lib/tutorwork/route";

/** POST /api/learners/:id/tags/group - put a family tag that has no group yet into a group of the skill map ("Xếp vào nhóm"). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runTutorWorkRoute("POST /api/learners/[id]/tags/group", (deps) => handleSetTagGroup(deps, id, body));
}
