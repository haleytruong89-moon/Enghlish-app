import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleWriteTeachingNote } from "@/lib/workdesk/handlers";
import { runWorkdeskRoute } from "@/lib/workdesk/route";

/** POST /api/learners/:id/teaching-notes - write one of the four teaching-note fields. The child's tutor only. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runWorkdeskRoute("POST /api/learners/[id]/teaching-notes", (deps) => handleWriteTeachingNote(deps, id, body));
}
