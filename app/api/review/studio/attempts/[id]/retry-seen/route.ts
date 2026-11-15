// app/api/review/studio/attempts/[id]/retry-seen/route.ts
import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleMarkRetrySeen } from "@/lib/studio/handlers";
import { runStudioRoute } from "@/lib/studio/route";

/** POST /api/review/studio/attempts/:id/retry-seen - "Đã xem" on the child's retries of this attempt (optional note, adults only). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runStudioRoute("POST /api/review/studio/attempts/[id]/retry-seen", (deps) => handleMarkRetrySeen(deps, id, body));
}
