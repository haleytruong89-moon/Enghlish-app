import type { NextRequest } from "next/server";
import { handleAddVersion } from "@/lib/curriculum/handlers";
import { runCurriculumRoute } from "@/lib/curriculum/route";
import { readJson } from "@/lib/inquiries/route";

export const maxDuration = 300;

/** POST - "Nạp mục lục" for an existing curriculum: a new version read from a PDF, or an empty one (Soạn tay). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runCurriculumRoute("POST /api/curricula/[id]/versions", (deps) => handleAddVersion(deps, id, body));
}
