import "server-only";
import { engineHook } from "@/lib/engine/hook";
import { NextResponse } from "next/server";
import { apiErrors } from "@/lib/copy/vi";
import { logAppError } from "@/lib/ops/logAppError";
import { createUserClient } from "@/lib/supabase/server";
import type { HandlerDeps, HandlerResult } from "./handlers";
import { createSupabaseReviewStore } from "./supabaseStore";

/** Shared glue for the S5 route files: session → handler → JSON (no-store), 500 logged. */
export async function runReviewRoute(
  routeName: string,
  run: (deps: HandlerDeps) => Promise<HandlerResult>,
): Promise<NextResponse> {
  let userId: string | null = null;
  try {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    const result = await run({ user, store: createSupabaseReviewStore(), afterWrite: engineHook(routeName, userId) });
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    await logAppError({ route: routeName, code: "internal", error: err, userId });
    return NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500 });
  }
}
