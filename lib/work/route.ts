import "server-only";
import { deferHook } from "@/lib/engine/defer";
import { writeHook } from "@/lib/engine/writeHook";
import { NextResponse } from "next/server";
import { logAppError } from "@/lib/ops/logAppError";
import { apiErrors } from "@/lib/copy/vi";
import { createUserClient } from "@/lib/supabase/server";
import type { HandlerDeps, HandlerResult } from "./handlers";
import { createSupabaseWorkStore } from "./supabaseStore";

/** Glue for the student route files: session → handler → JSON (no-store), 500 logged. */
export async function runWorkRoute(
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
    const result = await run({ user, store: createSupabaseWorkStore(), afterWrite: deferHook(writeHook(routeName, userId), { route: routeName, userId }) });
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    await logAppError({ route: routeName, code: "internal", error: err, userId });
    return NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500 });
  }
}
