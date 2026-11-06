// app/api/learners/[id]/studio/files/route.ts
import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleStudioUploadUrl } from "@/lib/studio/handlers";
import { runStudioRoute } from "@/lib/studio/route";

/** POST /api/learners/:id/studio/files - one-time upload link for a Studio test or answer key (PDF or .docx, ≤ 15 MB). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runStudioRoute("POST /api/learners/[id]/studio/files", (deps) => handleStudioUploadUrl(deps, id, body));
}
