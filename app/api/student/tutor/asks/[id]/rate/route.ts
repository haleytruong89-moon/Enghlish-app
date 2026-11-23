import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { childRpc } from "@/lib/notebook/childRoute";
import { isUuid, rateBodySchema } from "@/lib/notebook/handlers";

/** POST /api/student/tutor/asks/:id/rate — 😊 / 😐 / 😕 on one of the child's own asks (E2a). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = rateBodySchema.safeParse(await readJson(request));
  return childRpc("POST /api/student/tutor/asks/[id]/rate", "eng_rate_tutor_ask", isUuid(id) && p.success ? { p_ask: id, p_rating: p.data.rating } : null);
}
