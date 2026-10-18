import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleStaffSubmit } from "@/lib/practice/handlers";
import { runPracticeRoute } from "@/lib/practice/route";

/** POST /api/learners/:id/assignments/:aid/submissions - "nộp thay": send the student's work on their behalf (tutor or parent). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = await ctx.params;
  const body = await readJson(request);
  return runPracticeRoute("POST /api/learners/[id]/assignments/[aid]/submissions", (deps) => handleStaffSubmit(deps, id, aid, body));
}
