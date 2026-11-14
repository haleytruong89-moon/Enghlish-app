import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleMarkSession } from "@/lib/sessions/handlers";
import { runSessionsRoute } from "@/lib/sessions/route";

/** POST /api/learners/:id/sessions/marks - mark a lesson note Thường / Học bù / Không tính (the newest mark wins). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runSessionsRoute("POST /api/learners/[id]/sessions/marks", (deps) => handleMarkSession(deps, id, body));
}
