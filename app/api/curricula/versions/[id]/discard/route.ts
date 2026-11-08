import type { NextRequest } from "next/server";
import { handleDiscardVersion } from "@/lib/curriculum/handlers";
import { runCurriculumRoute } from "@/lib/curriculum/route";

/** POST - Bỏ nháp (tutor or parent). */
export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runCurriculumRoute("POST /api/curricula/versions/[id]/discard", (deps) => handleDiscardVersion(deps, id));
}
