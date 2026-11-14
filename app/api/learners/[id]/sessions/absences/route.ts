import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleRecordAbsence } from "@/lib/sessions/handlers";
import { runSessionsRoute } from "@/lib/sessions/route";

/** POST /api/learners/:id/sessions/absences - record an absence (date, who asked, billable or not). Tutor of the child or parent. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runSessionsRoute("POST /api/learners/[id]/sessions/absences", (deps) => handleRecordAbsence(deps, id, body));
}
