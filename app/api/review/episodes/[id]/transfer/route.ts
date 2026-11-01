import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleMarkTransfer } from "@/lib/review/handlers";
import { runReviewRoute } from "@/lib/review/route";

/** POST /api/review/episodes/:id/transfer - tick / untick "Bài này ở chủ đề / nguồn mới (vận dụng)" (S7a G4); the database applies D15 and "first attempt only". */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runReviewRoute("POST /api/review/episodes/[id]/transfer", (deps) => handleMarkTransfer(deps, id, body));
}
