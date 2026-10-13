import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleOffline } from "@/lib/review/handlers";
import { runReviewRoute } from "@/lib/review/route";

/** POST /api/learners/:id/offline-attempts — record work done outside the app (live in the session, or on paper). Text only. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runReviewRoute("POST /api/learners/[id]/offline-attempts", (deps) => handleOffline(deps, id, body));
}
