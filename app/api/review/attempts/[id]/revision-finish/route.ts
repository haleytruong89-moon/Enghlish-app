import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleFinishRevision } from "@/lib/revision/handlers";
import { runRevisionRoute } from "@/lib/revision/route";

/** POST /api/review/attempts/:id/revision-finish — verdict on every item + "Xong" (closing note) or "Mở vòng 2" (new feedback), in one call. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runRevisionRoute("POST /api/review/attempts/[id]/revision-finish", (deps) => handleFinishRevision(deps, id, body));
}
