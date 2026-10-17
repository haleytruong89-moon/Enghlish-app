import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleRetractAssignment } from "@/lib/practice/handlers";
import { runPracticeRoute } from "@/lib/practice/route";

/** POST /api/learners/:id/assignments/:aid/retract - take an assignment back (the student no longer sees it). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = await ctx.params;
  const body = await readJson(request);
  return runPracticeRoute("POST /api/learners/[id]/assignments/[aid]/retract", (deps) => handleRetractAssignment(deps, id, aid, body));
}
