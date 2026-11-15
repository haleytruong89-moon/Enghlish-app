import type { NextRequest } from "next/server";
import { handleRevealItem } from "@/lib/work/handlers";
import { runWorkRoute } from "@/lib/work/route";

/** POST /api/student/activities/:id/reveal - "Xem đáp án" for one wrong item of a practice work (gives up its retry). No engine reads it. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body: unknown = await request.json().catch(() => null);
  return runWorkRoute("POST /api/student/activities/[id]/reveal", (deps) => handleRevealItem(deps, id, body));
}
