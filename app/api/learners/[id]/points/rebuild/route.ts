// app/api/learners/[id]/points/rebuild/route.ts
import { handleRebuildPoints } from "@/lib/points/handlers";
import { runPointRoute } from "@/lib/points/route";

/** POST /api/learners/:id/points/rebuild - "Tính lại mức điểm từ đầu" from the book and the evidence (tutor, parent). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runPointRoute("POST /api/learners/[id]/points/rebuild", (deps) => handleRebuildPoints(deps, id));
}
