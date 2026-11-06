// app/api/learners/[id]/studio/drafts/route.ts
import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleCreateDraft, handleListDrafts } from "@/lib/studio/handlers";
import { runStudioRoute } from "@/lib/studio/route";

/** The AI reads the test in after(): up to 3 tries within this limit (spec §10 item 4). */
export const maxDuration = 300;

/** GET - the child's Studio drafts and tests. POST - a new draft ("Cho AI đọc đề" or "Soạn tay"). */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runStudioRoute("GET /api/learners/[id]/studio/drafts", (deps) => handleListDrafts(deps, id));
}
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runStudioRoute("POST /api/learners/[id]/studio/drafts", (deps) => handleCreateDraft(deps, id, body));
}
