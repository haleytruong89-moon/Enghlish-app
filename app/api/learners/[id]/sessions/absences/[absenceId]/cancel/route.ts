import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleCancelAbsence } from "@/lib/sessions/handlers";
import { runSessionsRoute } from "@/lib/sessions/route";

/** POST /api/learners/:id/sessions/absences/:absenceId/cancel - "Bỏ ghi nghỉ" (a new row with a reason; nothing is deleted). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string; absenceId: string }> }) {
  const { id, absenceId } = await ctx.params;
  const body = await readJson(request);
  return runSessionsRoute("POST /api/learners/[id]/sessions/absences/[absenceId]/cancel", (deps) => handleCancelAbsence(deps, id, absenceId, body));
}
