import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { childRpc } from "@/lib/notebook/childRoute";
import { isUuid, setBodySchema } from "@/lib/notebook/handlers";

/** PATCH /api/student/notebook/:id — {action: "remove" | "restore"} on one of the child's own items (E2a). */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = setBodySchema.safeParse(await readJson(request));
  return childRpc("PATCH /api/student/notebook/[id]", "eng_notebook_set", isUuid(id) && p.success ? { p_item: id, p_action: p.data.action } : null);
}
