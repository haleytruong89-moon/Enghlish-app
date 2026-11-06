import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleApprove } from "@/lib/studio/handlers";
import { runStudioRoute } from "@/lib/studio/route";

/** POST /api/studio/drafts/:id/approve */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runStudioRoute("POST /api/studio/drafts/[id]/approve", (deps) => handleApprove(deps, id, body));
}
