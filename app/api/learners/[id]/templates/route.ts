import type { NextRequest } from "next/server";
import { handleListTemplates } from "@/lib/inquiries/handlers";
import { runRoute } from "@/lib/inquiries/route";

/** GET /api/learners/:id/templates — published templates for the learner's track (parent, tutor). */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runRoute("GET /api/learners/[id]/templates", (deps) => handleListTemplates(deps, id));
}
