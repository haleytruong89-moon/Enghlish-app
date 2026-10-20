import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleRecordReadingReport } from "@/lib/reading/handlers";
import { runReadingRoute } from "@/lib/reading/route";

/** POST /api/learners/:id/reading-reports - record a monthly reading-skill report (tutor or parent of the child). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runReadingRoute("POST /api/learners/[id]/reading-reports", (deps) => handleRecordReadingReport(deps, id, body));
}
