import type { NextRequest } from "next/server";
import { handleDecideGoal } from "@/lib/goal/handlers";
import { runGoalRoute } from "@/lib/goal/route";
import { readJson } from "@/lib/inquiries/route";

/** POST /api/learners/:id/goals/:gid - the child's tutor agrees to (or adjusts) the weekly goal the child proposed. The parent only reads. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string; gid: string }> }) {
  const { id, gid } = await ctx.params;
  const body = await readJson(request);
  return runGoalRoute("POST /api/learners/[id]/goals/[gid]", (deps) => handleDecideGoal(deps, id, gid, body));
}
