import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiErrors } from "@/lib/copy/vi";
import { readJson } from "@/lib/inquiries/route";
import { handleAgain } from "@/lib/notebook/handlers";
import { lookupDeps } from "@/lib/notebook/routeDeps";
import { logAppError } from "@/lib/ops/logAppError";
import { createUserClient } from "@/lib/supabase/server";

export const maxDuration = 60;
const NO_STORE = { "Cache-Control": "private, no-store" };

/** POST /api/student/tutor/asks/:id/again — "Chưa hiểu, giải thích cách khác" on one of the child's own lookups (E2a). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const route = "POST /api/student/tutor/asks/[id]/again";
  let userId: string | null = null;
  try {
    const { data: { user } } = await (await createUserClient()).auth.getUser();
    userId = user?.id ?? null;
    const result = await handleAgain({ ...lookupDeps(), user: user ? { id: user.id } : null }, id, await readJson(request));
    return NextResponse.json(result.body, { status: result.status, headers: NO_STORE });
  } catch (err) {
    await logAppError({ route, code: "internal", error: err, userId });
    return NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500, headers: NO_STORE });
  }
}
