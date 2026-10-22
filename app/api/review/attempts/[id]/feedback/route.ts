import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleWriteFeedback } from "@/lib/revision/handlers";
import { runRevisionRoute } from "@/lib/revision/route";

/** POST /api/review/attempts/:id/feedback — "Góp ý cho con" on one piece of work (new, or "Sửa góp ý" with supersedes_id). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runRevisionRoute("POST /api/review/attempts/[id]/feedback", (deps) => handleWriteFeedback(deps, id, body));
}
