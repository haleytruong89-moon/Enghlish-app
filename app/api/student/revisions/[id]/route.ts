import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleStudentRevision, handleSubmitRevision } from "@/lib/work/handlers";
import { runWorkRoute } from "@/lib/work/route";

/** GET /api/student/revisions/:id — the revision page of the child's own REVISION step. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runWorkRoute("GET /api/student/revisions/[id]", (deps) => handleStudentRevision(deps, id));
}

/** POST /api/student/revisions/:id — submit the revision with a mark per item. Idempotent on client_submission_id; the reply is a receipt. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runWorkRoute("POST /api/student/revisions/[id]", (deps) => handleSubmitRevision(deps, id, body));
}
