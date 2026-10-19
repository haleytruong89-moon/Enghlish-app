import "server-only";
import { NextResponse } from "next/server";
import { apiErrors } from "@/lib/copy/vi";
import { logAppError } from "@/lib/ops/logAppError";
import type { HandlerResult } from "@/lib/review/handlers";
import { createUserClient } from "@/lib/supabase/server";
import type { PurgeDeps } from "./handlers";
import { createSupabasePurgeStore } from "./supabaseStore";

/** Session → handler → JSON (no-store), 500 logged. */
export async function runPurgeRoute(routeName: string, run: (deps: PurgeDeps) => Promise<HandlerResult>): Promise<NextResponse> {
  let userId: string | null = null;
  try {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    const result = await run({ user, store: createSupabasePurgeStore() });
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    await logAppError({ route: routeName, code: "internal", error: err, userId });
    return NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500 });
  }
}
