import type { NextRequest } from "next/server";
import { handleAssign, handleListInquiries } from "@/lib/inquiries/handlers";
import { readJson, runRoute } from "@/lib/inquiries/route";

/** GET /api/learners/:id/inquiries — assigned inquiries with effective schedule. Never returns answer keys. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runRoute("GET /api/learners/[id]/inquiries", (deps) => handleListInquiries(deps, id));
}

/** POST /api/learners/:id/inquiries — assign a template (idempotent on client_request_id). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runRoute("POST /api/learners/[id]/inquiries", (deps) => handleAssign(deps, id, body));
}
