// app/api/review/studio/attempts/[id]/route.ts
import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleDecide } from "@/lib/studio/handlers";
import { runStudioRoute } from "@/lib/studio/route";

/** POST /api/review/studio/attempts/:id - Đúng / Sai for the waiting items of one attempt; the last one writes Kết quả bài. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runStudioRoute("POST /api/review/studio/attempts/[id]", (deps) => handleDecide(deps, id, body));
}
