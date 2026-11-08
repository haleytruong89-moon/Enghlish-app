import type { NextRequest } from "next/server";
import { handleConfirmImport } from "@/lib/import/handlers";
import { runImportRoute } from "@/lib/import/route";
import { readJson } from "@/lib/inquiries/route";

/** POST - the child's tutor confirms the reviewed rows; the points are recomputed straight after (fail-soft). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runImportRoute("POST /api/imports/[id]/confirm", (deps) => handleConfirmImport(deps, id, body));
}
