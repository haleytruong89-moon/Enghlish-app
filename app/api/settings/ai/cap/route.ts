import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleSetAiCap } from "@/lib/studio/handlers";
import { runStudioRoute } from "@/lib/studio/route";

/** PUT /api/settings/ai/cap — the family's monthly AI cap and its warning (parent only). */
export async function PUT(request: NextRequest) {
  const body = await readJson(request);
  return runStudioRoute("PUT /api/settings/ai/cap", (deps) => handleSetAiCap(deps, body));
}
