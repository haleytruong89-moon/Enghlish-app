import type { NextRequest } from "next/server";
import { handleGetVersion, handleSaveVersion } from "@/lib/curriculum/handlers";
import { runCurriculumRoute } from "@/lib/curriculum/route";
import { readJson } from "@/lib/inquiries/route";

/** GET - one version (?view=status while the AI reads). PUT - save the edited draft (optimistic lock). */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const view = request.nextUrl.searchParams.get("view") === "status" ? "status" : undefined;
  return runCurriculumRoute("GET /api/curricula/versions/[id]", (deps) => handleGetVersion(deps, id, { view }));
}
export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runCurriculumRoute("PUT /api/curricula/versions/[id]", (deps) => handleSaveVersion(deps, id, body));
}
