import "server-only";
import { logAppError } from "@/lib/ops/logAppError";
import { isMissingFunction } from "../runner";
import { makePointHook, type PointHook } from "./runner";
import { createSupabasePointStore } from "./supabaseStore";

/** The hook the route glue hands to write handlers: recompute the child's points after the write; errors go to app_errors (point_recompute). */
export function pointHook(route: string, userId: string | null): PointHook {
  return makePointHook(createSupabasePointStore, (error) => logAppError({ route, code: "point_recompute", error, userId }), isMissingFunction);
}
