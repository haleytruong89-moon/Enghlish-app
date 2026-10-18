import type { NextRequest } from "next/server";
import { handleStaffFile } from "@/lib/practice/handlers";
import { runFileRedirectRoute } from "@/lib/practice/route";

/** GET /api/files/:id - tutor / parent: redirects to a fresh 5-minute link of a stored file of a child they may see. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runFileRedirectRoute("GET /api/files/[id]", (deps) => handleStaffFile(deps, id));
}
