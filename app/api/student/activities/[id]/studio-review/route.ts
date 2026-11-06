import type { NextRequest } from "next/server";
import { handleStudentStudioReview } from "@/lib/work/handlers";
import { runWorkRoute } from "@/lib/work/route";

/** GET /api/student/activities/:id/studio-review - the child's "Câu cần xem lại" (wrong items, waiting numbers; never a score). */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runWorkRoute("GET /api/student/activities/[id]/studio-review", (deps) => handleStudentStudioReview(deps, id));
}
