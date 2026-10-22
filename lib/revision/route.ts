import "server-only";
import { NextResponse } from "next/server";
import { apiErrors } from "@/lib/copy/vi";
import { logAppError } from "@/lib/ops/logAppError";
import type { HandlerResult } from "@/lib/review/handlers";
import { createUserClient } from "@/lib/supabase/server";
import type { RevisionDeps } from "./handlers";
import { createSupabaseRevisionStore } from "./supabaseStore";

/** Session → handler → JSON (no-store); 500 logged. Same glue as lib/review/route.ts. */
export async function runRevisionRoute(routeName: string, run: (deps: RevisionDeps) => Promise<HandlerResult>): Promise<NextResponse> {
  let userId: string | null = null;
  try {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    const result = await run({ user, store: createSupabaseRevisionStore() });
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    await logAppError({ route: routeName, code: "internal", error: err, userId });
    return NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500 });
  }
}
