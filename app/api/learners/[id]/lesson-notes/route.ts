import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleListNotes, handleWriteNote } from "@/lib/review/handlers";
import { runReviewRoute } from "@/lib/review/route";

/** GET /api/learners/:id/lesson-notes — notes of one child (tutor: all versions; parent: published, current ones). */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runReviewRoute("GET /api/learners/[id]/lesson-notes", (deps) => handleListNotes(deps, id));
}

/** POST /api/learners/:id/lesson-notes — tutor only; at most 3 next actions; edits are new versions (supersedes_id). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runReviewRoute("POST /api/learners/[id]/lesson-notes", (deps) => handleWriteNote(deps, id, body));
}
