import type { NextRequest } from "next/server";
import { handleActivityEvent } from "@/lib/inquiries/handlers";
import { readJson, runRoute } from "@/lib/inquiries/route";

/** POST /api/activities/:id/events — reschedule / skip / unskip one step; a reason is required. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runRoute("POST /api/activities/[id]/events", (deps) => handleActivityEvent(deps, id, body));
}
