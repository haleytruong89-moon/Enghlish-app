import type { NextRequest } from "next/server";
import { handleEditCurriculum } from "@/lib/curriculum/handlers";
import { runCurriculumRoute } from "@/lib/curriculum/route";
import { readJson } from "@/lib/inquiries/route";

/** POST - "Sửa mục lục / bảng nối": a draft of the next version, copied from the version in use. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runCurriculumRoute("POST /api/curricula/[id]/edit", (deps) => handleEditCurriculum(deps, id, body));
}
