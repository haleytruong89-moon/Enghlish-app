import type { NextRequest } from "next/server";
import { handleRetryImport } from "@/lib/import/handlers";
import { runImportRoute } from "@/lib/import/route";
import { readJson } from "@/lib/inquiries/route";

export const maxDuration = 300;

/** POST - after a failed read: {mode: "retry"} asks the AI again on the SAME import; {mode: "manual"} opens an empty draft for the tutor to type. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runImportRoute("POST /api/imports/[id]/retry", (deps) => handleRetryImport(deps, id, body));
}
