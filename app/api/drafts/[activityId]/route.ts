import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleSaveDraft } from "@/lib/work/handlers";
import { runWorkRoute } from "@/lib/work/route";

/** PUT /api/drafts/:activityId — autosave of the student's own working draft (the only mutable learner row). */
export async function PUT(request: NextRequest, ctx: { params: Promise<{ activityId: string }> }) {
  const { activityId } = await ctx.params;
  const body = await readJson(request);
  return runWorkRoute("PUT /api/drafts/[activityId]", (deps) => handleSaveDraft(deps, activityId, body));
}
