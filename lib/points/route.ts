// lib/points/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { apiErrors } from "@/lib/copy/vi";
import { createSupabasePointStore } from "@/lib/engine/points/supabaseStore";
import { logAppError } from "@/lib/ops/logAppError";
import type { HandlerResult } from "@/lib/review/handlers";
import { createUserClient } from "@/lib/supabase/server";
import type { PointDeps } from "./handlers";
import { createSupabasePointsStore } from "./supabaseStore";

/** Session → handler → JSON (no-store); 500 logged. Same glue as lib/skills/route.ts, with the point stores. */
export async function runPointRoute(routeName: string, run: (deps: PointDeps) => Promise<HandlerResult>): Promise<NextResponse> {
  let userId: string | null = null;
  try {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    const result = await run({
      user,
      store: createSupabasePointsStore(),
      engine: createSupabasePointStore(),
      log: (error) => logAppError({ route: routeName, code: "point_recompute", error, userId }),
    });
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    await logAppError({ route: routeName, code: "internal", error: err, userId });
    return NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500 });
  }
}
