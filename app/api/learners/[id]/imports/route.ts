import type { NextRequest } from "next/server";
import { handleCreateImport } from "@/lib/import/handlers";
import { runImportRoute } from "@/lib/import/route";
import { readJson } from "@/lib/inquiries/route";

/** The AI reads the paper in after(): up to 3 tries within this limit (same as Studio B1 and the curriculum). */
export const maxDuration = 300;

/** POST - a new import of finished paper work (tutor or parent); the AI read starts in the background. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runImportRoute("POST /api/learners/[id]/imports", (deps) => handleCreateImport(deps, id, body));
}
