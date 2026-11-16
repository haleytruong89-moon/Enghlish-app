import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleImportDraft } from "@/lib/studio/handlers";
import { runStudioRoute } from "@/lib/studio/route";

/** POST - "Nhập bài soạn sẵn": one pre-made draft file → a Studio draft of the child (no AI). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runStudioRoute("POST /api/learners/[id]/studio/imports", (deps) => handleImportDraft(deps, id, body));
}
