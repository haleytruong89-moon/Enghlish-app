// app/api/studio/drafts/[id]/route.ts
import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleGetDraft, handleSaveDraft } from "@/lib/studio/handlers";
import { runStudioRoute } from "@/lib/studio/route";

/** GET - one draft (?view=status while the AI reads). PUT - save the edited draft (optimistic lock). */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const view = request.nextUrl.searchParams.get("view") === "status" ? "status" : undefined;
  return runStudioRoute("GET /api/studio/drafts/[id]", (deps) => handleGetDraft(deps, id, { view }));
}
export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runStudioRoute("PUT /api/studio/drafts/[id]", (deps) => handleSaveDraft(deps, id, body));
}
