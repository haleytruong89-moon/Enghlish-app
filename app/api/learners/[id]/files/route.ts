import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleStaffUploadUrl } from "@/lib/practice/handlers";
import { runPracticeRoute } from "@/lib/practice/route";

/** POST /api/learners/:id/files - a one-time upload link for an assignment PDF, an answer key, or a photo sent on the student's behalf. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runPracticeRoute("POST /api/learners/[id]/files", (deps) => handleStaffUploadUrl(deps, id, body));
}
