import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleSetMainCurriculum } from "@/lib/roadmap/handlers";
import { runRoadmapRoute } from "@/lib/roadmap/route";

/** POST /api/learners/:id/roadmap/main - choose the curriculum the child's mountain follows. The child's tutor only. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runRoadmapRoute("POST /api/learners/[id]/roadmap/main", (deps) => handleSetMainCurriculum(deps, id, body));
}
