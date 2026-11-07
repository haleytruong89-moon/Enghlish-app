import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleWriteIntake } from "@/lib/workdesk/handlers";
import { runWorkdeskRoute } from "@/lib/workdesk/route";

/** POST /api/learners/:id/intake - write the intake profile (goals, starting strengths / weaknesses). The child's tutor only. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runWorkdeskRoute("POST /api/learners/[id]/intake", (deps) => handleWriteIntake(deps, id, body));
}
