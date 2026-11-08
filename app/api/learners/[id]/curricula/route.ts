import type { NextRequest } from "next/server";
import { handleCreateCurriculum } from "@/lib/curriculum/handlers";
import { runCurriculumRoute } from "@/lib/curriculum/route";
import { readJson } from "@/lib/inquiries/route";

/** The AI reads the contents in after(): up to 3 tries within this limit (same as Studio B1). */
export const maxDuration = 300;

/** POST - a new curriculum + version 1 ("Cho AI đọc mục lục" or "Soạn tay"). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runCurriculumRoute("POST /api/learners/[id]/curricula", (deps) => handleCreateCurriculum(deps, id, body));
}
