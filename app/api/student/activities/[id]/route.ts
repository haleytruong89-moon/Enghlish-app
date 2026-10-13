import type { NextRequest } from "next/server";
import { handleStudentActivity } from "@/lib/work/handlers";
import { runWorkRoute } from "@/lib/work/route";

/** GET /api/student/activities/:id — one released step: questions, reading sources, own draft and own attempts. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runWorkRoute("GET /api/student/activities/[id]", (deps) => handleStudentActivity(deps, id));
}
