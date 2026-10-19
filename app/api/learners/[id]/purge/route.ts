import { NextResponse, type NextRequest } from "next/server";
import { apiErrors } from "@/lib/copy/vi";
import { readJson } from "@/lib/inquiries/route";
import { handlePurgeLearner } from "@/lib/purge/handlers";
import { isSameOrigin } from "@/lib/purge/origin";
import { runPurgeRoute } from "@/lib/purge/route";

/**
 * POST /api/learners/:id/purge - delete one child's data in this app (parent only; the typed name must match; a real child needs a second
 * confirmation). Requests that do not come from this site's own pages are refused with 403 before anything else is read.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request.headers)) {
    return NextResponse.json({ error: "forbidden", message: apiErrors[403] }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runPurgeRoute("POST /api/learners/[id]/purge", (deps) => handlePurgeLearner(deps, id, body));
}
