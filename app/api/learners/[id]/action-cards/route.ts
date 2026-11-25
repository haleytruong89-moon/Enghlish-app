import type { NextRequest } from "next/server";
import { handleDecideActionCard } from "@/lib/actioncards/handlers";
import { runActionCardRoute } from "@/lib/actioncards/route";
import { readJson } from "@/lib/inquiries/route";

/** POST /api/learners/:id/action-cards - the child's tutor or the parent marks a "Việc nên làm" card "Đã làm" / "Bỏ qua" (with a reason). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runActionCardRoute("POST /api/learners/[id]/action-cards", (deps) => handleDecideActionCard(deps, id, body));
}
