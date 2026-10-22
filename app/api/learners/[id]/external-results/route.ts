import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleRecordExternalResult } from "@/lib/levels/handlers";
import { runLevelRoute } from "@/lib/levels/route";

/** POST /api/learners/:id/external-results - an external exam result (tutor or parent of the child). It never changes a level. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runLevelRoute("POST /api/learners/[id]/external-results", (deps) => handleRecordExternalResult(deps, id, body));
}
