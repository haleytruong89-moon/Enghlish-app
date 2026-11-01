// app/api/learners/[id]/skills/route.ts
import { handleSkillStates } from "@/lib/skills/handlers";
import { runSkillRoute } from "@/lib/skills/route";

/** GET /api/learners/:id/skills - the level, ⚑ and open proposal of every skill of the child's set (tutor, parent). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runSkillRoute("GET /api/learners/[id]/skills", (deps) => handleSkillStates(deps, id));
}
