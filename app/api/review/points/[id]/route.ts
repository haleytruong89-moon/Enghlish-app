// app/api/review/points/[id]/route.ts
import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleDecidePoint } from "@/lib/points/handlers";
import { runPointRoute } from "@/lib/points/route";

/** POST /api/review/points/:id - "Xác nhận" or "Chưa" (with a reason) on one point proposal; "Giữ mức" on a ⚑ (the child's tutor only; one at a time). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runPointRoute("POST /api/review/points/[id]", (deps) => handleDecidePoint(deps, id, body));
}
