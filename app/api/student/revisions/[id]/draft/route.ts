import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleSaveRevisionDraft } from "@/lib/work/handlers";
import { runWorkRoute } from "@/lib/work/route";

/** PUT /api/student/revisions/:id/draft — autosave of the revision (text + marks). */
export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runWorkRoute("PUT /api/student/revisions/[id]/draft", (deps) => handleSaveRevisionDraft(deps, id, body));
}
