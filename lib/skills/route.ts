// lib/skills/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { apiErrors } from "@/lib/copy/vi";
import { createSupabaseEngineStore } from "@/lib/engine/supabaseStore";
import { logAppError } from "@/lib/ops/logAppError";
import type { HandlerResult } from "@/lib/review/handlers";
import { createUserClient } from "@/lib/supabase/server";
import type { SkillDeps } from "./handlers";
import { createSupabaseSkillStore } from "./supabaseStore";

/** Session → handler → JSON (no-store); 500 logged. Same glue as lib/levels/route.ts, plus the engine store. */
export async function runSkillRoute(routeName: string, run: (deps: SkillDeps) => Promise<HandlerResult>): Promise<NextResponse> {
  let userId: string | null = null;
  try {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    const result = await run({
      user,
      store: createSupabaseSkillStore(),
      engine: createSupabaseEngineStore(),
      log: (error) => logAppError({ route: routeName, code: "engine_recompute", error, userId }),
    });
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    await logAppError({ route: routeName, code: "internal", error: err, userId });
    return NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500 });
  }
}
