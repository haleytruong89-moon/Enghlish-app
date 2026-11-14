import { NextResponse, type NextRequest } from "next/server";
import { requireAccess } from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import { handlePendingCount } from "@/lib/desk/countRoute";
import { loadPendingRows } from "@/lib/desk/load";
import { logAppError } from "@/lib/ops/logAppError";
import { createUserClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** GET /api/learners/:id/pending-count - the number beside "Chờ duyệt" (tutor or parent of the child; read-only). */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let userId: string | null = null;
  try {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    const r = await handlePendingCount({ user, access: requireAccess, load: loadPendingRows }, id);
    return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    await logAppError({ route: "GET /api/learners/[id]/pending-count", code: "internal", error: err, userId });
    return NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500 });
  }
}
