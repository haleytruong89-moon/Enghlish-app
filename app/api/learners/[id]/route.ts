import { NextResponse, type NextRequest } from "next/server";
import { AccessError, requireAccess } from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import { logAppError } from "@/lib/ops/logAppError";
import { createUserClient } from "@/lib/supabase/server";

/**
 * GET /api/learners/:id — first example of the route pattern:
 *   1. who is calling (session cookie, validated by Supabase Auth)
 *   2. requireAccess(user, learnerId, action) — 404 for anything outside scope
 *   3. return only fields the caller's role may see
 */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let userId: string | null = null;
  try {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;

    const { learner, member } = await requireAccess(user, id, "learner:read");

    return NextResponse.json(
      {
        id: learner.id,
        alias: learner.alias,
        // Track label is staff-only (students never see codes).
        ...(member.role === "student" ? {} : { trackId: learner.trackId, status: learner.status }),
        isTest: learner.isTest,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json(
        { error: err.message, message: apiErrors[err.status] },
        { status: err.status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    await logAppError({ route: "GET /api/learners/[id]", code: "internal", error: err, userId });
    return NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500 });
  }
}
