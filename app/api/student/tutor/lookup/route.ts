import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiErrors } from "@/lib/copy/vi";
import { readJson } from "@/lib/inquiries/route";
import { handleLookup } from "@/lib/notebook/handlers";
import { lookupDeps } from "@/lib/notebook/routeDeps";
import { logAppError } from "@/lib/ops/logAppError";
import { createUserClient } from "@/lib/supabase/server";

export const maxDuration = 60;
const NO_STORE = { "Cache-Control": "private, no-store" };

/** POST /api/student/tutor/lookup — "Tra từ" (E2a). The child only; the user id comes from the session. */
export async function POST(request: NextRequest) {
  const route = "POST /api/student/tutor/lookup";
  let userId: string | null = null;
  try {
    const { data: { user } } = await (await createUserClient()).auth.getUser();
    userId = user?.id ?? null;
    const result = await handleLookup({ ...lookupDeps(), user: user ? { id: user.id } : null }, await readJson(request));
    return NextResponse.json(result.body, { status: result.status, headers: NO_STORE });
  } catch (err) {
    await logAppError({ route, code: "internal", error: err, userId });
    return NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500, headers: NO_STORE });
  }
}
