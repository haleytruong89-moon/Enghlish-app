import { handleDiscardImport } from "@/lib/import/handlers";
import { runImportRoute } from "@/lib/import/route";

/** POST - drop an import that is not confirmed yet (tutor or parent). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runImportRoute("POST /api/imports/[id]/discard", (deps) => handleDiscardImport(deps, id));
}
