import type { NextRequest } from "next/server";
import { handleApproveVersion } from "@/lib/curriculum/handlers";
import { runCurriculumRoute } from "@/lib/curriculum/route";
import { readJson } from "@/lib/inquiries/route";

/** POST - Duyệt (the child's tutor only). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runCurriculumRoute("POST /api/curricula/versions/[id]/approve", (deps) => handleApproveVersion(deps, id, body));
}
