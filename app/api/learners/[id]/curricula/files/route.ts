import type { NextRequest } from "next/server";
import { handleTocUploadUrl } from "@/lib/curriculum/handlers";
import { runCurriculumRoute } from "@/lib/curriculum/route";
import { readJson } from "@/lib/inquiries/route";

/** POST - a one-time upload link for the PDF table of contents of a curriculum of this child. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runCurriculumRoute("POST /api/learners/[id]/curricula/files", (deps) => handleTocUploadUrl(deps, id, body));
}
