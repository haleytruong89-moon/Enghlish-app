import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleEditApproved } from "@/lib/studio/handlers";
import { runStudioRoute } from "@/lib/studio/route";

/** POST /api/studio/drafts/:id/edit */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runStudioRoute("POST /api/studio/drafts/[id]/edit", (deps) => handleEditApproved(deps, id, body));
}
