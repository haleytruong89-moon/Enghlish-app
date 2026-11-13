import "server-only";
import { after } from "next/server";
import { logAppError } from "@/lib/ops/logAppError";

/**
 * Run a fail-soft "recompute after the write" hook AFTER the response is sent (`after()`), so the adult sees "Đã lưu" at once instead of
 * waiting for the engine. The hooks never throw by design; this adds one more net so nothing can escape unhandled inside `after`:
 * an error is written to app_errors (engine_deferred) and swallowed. Handlers still `await` the hook as before (it returns at once).
 */
export function deferHook<A extends unknown[]>(
  hook: (...a: A) => Promise<void>,
  ctx: { route: string; userId: string | null },
  schedule: (job: () => Promise<void>) => void = (job) => after(job),
): (...a: A) => Promise<void> {
  return async (...a) => {
    schedule(async () => {
      try {
        await hook(...a);
      } catch (error) {
        await logAppError({ route: ctx.route, code: "engine_deferred", error, userId: ctx.userId });
      }
    });
  };
}
