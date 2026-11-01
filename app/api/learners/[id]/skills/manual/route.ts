// app/api/learners/[id]/skills/manual/route.ts
import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleManualSkill } from "@/lib/skills/handlers";
import { runSkillRoute } from "@/lib/skills/route";

/** POST /api/learners/:id/skills/manual - set a skill to level 1 or 2 by hand, with a reason (the child's tutor only). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runSkillRoute("POST /api/learners/[id]/skills/manual", (deps) => handleManualSkill(deps, id, body));
}
