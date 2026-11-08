import type { NextRequest } from "next/server";
import { handleImportUploadUrl } from "@/lib/import/handlers";
import { runImportRoute } from "@/lib/import/route";
import { readJson } from "@/lib/inquiries/route";

/** POST - a one-time upload link for the child's finished work or its answer key. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runImportRoute("POST /api/learners/[id]/imports/files", (deps) => handleImportUploadUrl(deps, id, body));
}
