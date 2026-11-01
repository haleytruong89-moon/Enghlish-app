// app/api/learners/[id]/skills/rebuild/route.ts
import { handleRebuild } from "@/lib/skills/handlers";
import { runSkillRoute } from "@/lib/skills/route";

/** POST /api/learners/:id/skills/rebuild - "Tính lại từ đầu": rebuild the child's skill states from the book and the evidence (tutor, parent). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runSkillRoute("POST /api/learners/[id]/skills/rebuild", (deps) => handleRebuild(deps, id));
}
