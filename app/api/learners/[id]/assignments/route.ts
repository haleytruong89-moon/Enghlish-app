import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleAssignmentsList, handleCreateAssignment } from "@/lib/practice/handlers";
import { runPracticeRoute } from "@/lib/practice/route";

/** GET /api/learners/:id/assignments - the practice given to a learner, with what was sent back (tutor or parent). */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runPracticeRoute("GET /api/learners/[id]/assignments", (deps) => handleAssignmentsList(deps, id));
}

/** POST /api/learners/:id/assignments - give a link or an uploaded PDF (tutor or parent). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runPracticeRoute("POST /api/learners/[id]/assignments", (deps) => handleCreateAssignment(deps, id, body));
}
