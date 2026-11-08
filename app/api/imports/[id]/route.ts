import type { NextRequest } from "next/server";
import { handleGetImport } from "@/lib/import/handlers";
import { runImportRoute } from "@/lib/import/route";

/** GET - one import (?view=status while the AI reads). */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const view = request.nextUrl.searchParams.get("view") === "status" ? "status" : undefined;
  return runImportRoute("GET /api/imports/[id]", (deps) => handleGetImport(deps, id, { view }));
}
