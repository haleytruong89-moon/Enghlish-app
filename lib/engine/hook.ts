import "server-only";
import { logAppError } from "@/lib/ops/logAppError";
import { makeEngineHook, type EngineHook } from "./runner";
import { createSupabaseEngineStore } from "./supabaseStore";

/** The hook the route glue hands to write handlers: recompute the child's skills after the write; errors go to app_errors (engine_recompute). */
export function engineHook(route: string, userId: string | null): EngineHook {
  return makeEngineHook(createSupabaseEngineStore, (error) => logAppError({ route, code: "engine_recompute", error, userId }));
}
