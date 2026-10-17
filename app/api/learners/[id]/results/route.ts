import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleRecordResult } from "@/lib/tutorwork/handlers";
import { runTutorWorkRoute } from "@/lib/tutorwork/route";

/** POST /api/learners/:id/results - record a test / homework result (tutor or parent; in-class work: tutor only, the database decides). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runTutorWorkRoute("POST /api/learners/[id]/results", (deps) => handleRecordResult(deps, id, body));
}
