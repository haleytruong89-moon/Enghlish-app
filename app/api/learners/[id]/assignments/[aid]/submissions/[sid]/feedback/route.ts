import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleWriteSubmissionFeedback } from "@/lib/practice/handlers";
import { runPracticeRoute } from "@/lib/practice/route";

/** POST /api/learners/:id/assignments/:aid/submissions/:sid/feedback - the tutor or a parent gives (or edits) feedback on what the child sent. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string; aid: string; sid: string }> }) {
  const { id, aid, sid } = await ctx.params;
  const body = await readJson(request);
  return runPracticeRoute("POST /api/learners/[id]/assignments/[aid]/submissions/[sid]/feedback", (deps) => handleWriteSubmissionFeedback(deps, id, aid, sid, body));
}
