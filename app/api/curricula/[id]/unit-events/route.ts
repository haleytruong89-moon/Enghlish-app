import type { NextRequest } from "next/server";
import { handleSetUnitStatus } from "@/lib/curriculum/handlers";
import { runCurriculumRoute } from "@/lib/curriculum/route";
import { readJson } from "@/lib/inquiries/route";

/** POST - set the status of one unit (a new event; old events stay). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runCurriculumRoute("POST /api/curricula/[id]/unit-events", (deps) => handleSetUnitStatus(deps, id, body));
}
