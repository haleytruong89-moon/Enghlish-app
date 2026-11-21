import type { NextRequest } from "next/server";
import { handleRestoreDraft } from "@/lib/studio/handlers";
import { runStudioRoute } from "@/lib/studio/route";

/** POST /api/studio/drafts/:id/restore - a discarded draft → a new draft with the same questions. */
export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runStudioRoute("POST /api/studio/drafts/[id]/restore", (deps) => handleRestoreDraft(deps, id));
}
