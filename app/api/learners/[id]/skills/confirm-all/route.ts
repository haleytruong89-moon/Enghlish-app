// app/api/learners/[id]/skills/confirm-all/route.ts
import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleConfirmAll } from "@/lib/skills/handlers";
import { runSkillRoute } from "@/lib/skills/route";

/** POST /api/learners/:id/skills/confirm-all - "Xác nhận tất cả": the level-up proposals shown on screen, never a ⚑ (the child's tutor only). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runSkillRoute("POST /api/learners/[id]/skills/confirm-all", (deps) => handleConfirmAll(deps, id, body));
}
