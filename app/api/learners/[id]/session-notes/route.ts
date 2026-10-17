import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleWriteSessionNote } from "@/lib/tutorwork/handlers";
import { runTutorWorkRoute } from "@/lib/tutorwork/route";

/** POST /api/learners/:id/session-notes - "Ghi buổi học" (v2): what was studied, up to 3 tags, message, note for parent, rechecks. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runTutorWorkRoute("POST /api/learners/[id]/session-notes", (deps) => handleWriteSessionNote(deps, id, body));
}
