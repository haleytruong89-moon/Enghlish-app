import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleUpdateAppFeedback } from "@/lib/workdesk/handlers";
import { runWorkdeskRoute } from "@/lib/workdesk/route";

/** POST /api/feedback/:id - the parent sets the status and an optional reply (a new event; nothing is overwritten). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runWorkdeskRoute("POST /api/feedback/[id]", (deps) => handleUpdateAppFeedback(deps, id, body));
}
