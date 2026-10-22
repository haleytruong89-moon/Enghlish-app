import "server-only";
import { NextResponse } from "next/server";
import { apiErrors } from "@/lib/copy/vi";
import { logAppError } from "@/lib/ops/logAppError";
import type { HandlerResult } from "@/lib/review/handlers";
import { createFileStorage } from "@/lib/storage/server";
import { createUserClient } from "@/lib/supabase/server";
import type { LevelDeps } from "./handlers";
import { createSupabaseLevelStore } from "./supabaseStore";

/** Session → handler → JSON (no-store); 500 logged. Same glue as lib/reading/route.ts, plus file storage for the exam-sheet check. */
export async function runLevelRoute(routeName: string, run: (deps: LevelDeps) => Promise<HandlerResult>): Promise<NextResponse> {
  let userId: string | null = null;
  try {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    const result = await run({ user, store: createSupabaseLevelStore(), storage: createFileStorage() });
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    await logAppError({ route: routeName, code: "internal", error: err, userId });
    return NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500 });
  }
}
