import "server-only";
import { NextResponse } from "next/server";
import { apiErrors } from "@/lib/copy/vi";
import { logAppError } from "@/lib/ops/logAppError";
import type { HandlerResult } from "@/lib/review/handlers";
import { createUserClient } from "@/lib/supabase/server";
import type { RoadmapDeps } from "./handlers";
import { createSupabaseRoadmapStore } from "./supabaseStore";

/** Glue of the W4a route files: session → handler → JSON (no-store), 500 logged. */
export async function runRoadmapRoute(routeName: string, run: (deps: RoadmapDeps) => Promise<HandlerResult>): Promise<NextResponse> {
  let userId: string | null = null;
  try {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    const result = await run({ user, store: createSupabaseRoadmapStore() });
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    await logAppError({ route: routeName, code: "internal", error: err, userId });
    return NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500 });
  }
}
