import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleWriteMilestone } from "@/lib/roadmap/handlers";
import { runRoadmapRoute } from "@/lib/roadmap/route";

/** POST /api/learners/:id/roadmap/milestones - place, confirm, edit or remove a milestone (a new version each time). The child's tutor only. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runRoadmapRoute("POST /api/learners/[id]/roadmap/milestones", (deps) => handleWriteMilestone(deps, id, body));
}
