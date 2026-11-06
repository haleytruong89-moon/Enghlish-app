import type { NextRequest } from "next/server";
import { handleDiscard } from "@/lib/studio/handlers";
import { runStudioRoute } from "@/lib/studio/route";

/** POST /api/studio/drafts/:id/discard */
export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runStudioRoute("POST /api/studio/drafts/[id]/discard", (deps) => handleDiscard(deps, id));
}
