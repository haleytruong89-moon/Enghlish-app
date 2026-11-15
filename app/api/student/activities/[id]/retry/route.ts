import type { NextRequest } from "next/server";
import { handleRetryItem } from "@/lib/work/handlers";
import { runWorkRoute } from "@/lib/work/route";

/** POST /api/student/activities/:id/retry - one retry of one item (practice only). It goes to the tutor; no engine reads it. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body: unknown = await request.json().catch(() => null);
  return runWorkRoute("POST /api/student/activities/[id]/retry", (deps) => handleRetryItem(deps, id, body));
}
