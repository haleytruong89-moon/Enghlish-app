import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleRecordLevels } from "@/lib/levels/handlers";
import { runLevelRoute } from "@/lib/levels/route";

/** POST /api/learners/:id/levels - confirm the starting levels (baseline) or adjust one level with a reason. The child's tutor only. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runLevelRoute("POST /api/learners/[id]/levels", (deps) => handleRecordLevels(deps, id, body));
}
