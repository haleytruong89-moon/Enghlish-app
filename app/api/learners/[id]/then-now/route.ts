import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handlePickThenNow } from "@/lib/thennow/handlers";
import { runThenNowRoute } from "@/lib/thennow/route";

/** POST /api/learners/:id/then-now - the child's tutor picks (or hides) the pair of writings for "Ngày ấy – bây giờ". The parent only reads. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runThenNowRoute("POST /api/learners/[id]/then-now", (deps) => handlePickThenNow(deps, id, body));
}
