// app/api/skills/decisions/[id]/route.ts
import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleDecideSkill } from "@/lib/skills/handlers";
import { runSkillRoute } from "@/lib/skills/route";

/** POST /api/skills/decisions/:id - "Xác nhận" or "Chưa" (with a reason) on one proposal; "Giữ bậc" on a ⚑ (the child's tutor only). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runSkillRoute("POST /api/skills/decisions/[id]", (deps) => handleDecideSkill(deps, id, body));
}
