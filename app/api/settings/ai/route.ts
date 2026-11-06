// app/api/settings/ai/route.ts
import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleAiSettings, handleSetAiSettings } from "@/lib/studio/handlers";
import { runStudioRoute } from "@/lib/studio/route";

/** GET / PUT the family's AI switch (parent only). PUT {enabled} also records an ai_text consent for each child. */
export async function GET() {
  return runStudioRoute("GET /api/settings/ai", (deps) => handleAiSettings(deps));
}
export async function PUT(request: NextRequest) {
  const body = await readJson(request);
  return runStudioRoute("PUT /api/settings/ai", (deps) => handleSetAiSettings(deps, body));
}
