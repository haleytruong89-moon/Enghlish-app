import type { NextRequest } from "next/server";
import { handleStudentResultView } from "@/lib/work/handlers";
import { runWorkRoute } from "@/lib/work/route";

/** GET /api/student/activities/:id/result - the child's screen after submitting (items to look at again; never an answer, a score or a count). */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runWorkRoute("GET /api/student/activities/[id]/result", (deps) => handleStudentResultView(deps, id));
}
