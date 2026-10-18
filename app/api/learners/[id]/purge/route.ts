import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handlePurgeLearner } from "@/lib/purge/handlers";
import { runPurgeRoute } from "@/lib/purge/route";

/** POST /api/learners/:id/purge - delete one child's data in this app (parent only; the typed name must match; a real child needs a second confirmation). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runPurgeRoute("POST /api/learners/[id]/purge", (deps) => handlePurgeLearner(deps, id, body));
}
