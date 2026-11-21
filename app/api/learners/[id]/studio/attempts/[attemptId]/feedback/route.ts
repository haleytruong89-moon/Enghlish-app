import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleWriteStudioFeedback } from "@/lib/practice/handlers";
import { runPracticeRoute } from "@/lib/practice/route";

/** POST /api/learners/:id/studio/attempts/:attemptId/feedback - the tutor or a parent gives (or edits) feedback on one lần làm of a Studio test. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string; attemptId: string }> }) {
  const { id, attemptId } = await ctx.params;
  const body = await readJson(request);
  return runPracticeRoute("POST /api/learners/[id]/studio/attempts/[attemptId]/feedback", (deps) => handleWriteStudioFeedback(deps, id, attemptId, body));
}
