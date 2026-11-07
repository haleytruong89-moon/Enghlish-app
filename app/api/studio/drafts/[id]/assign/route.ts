import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleAssign } from "@/lib/studio/handlers";
import { runStudioRoute } from "@/lib/studio/route";

/** POST /api/studio/drafts/:id/assign */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runStudioRoute("POST /api/studio/drafts/[id]/assign", (deps) => handleAssign(deps, id, body));
}
