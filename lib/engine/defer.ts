import "server-only";
import { after } from "next/server";
import { logAppError } from "@/lib/ops/logAppError";

/**
 * Run a fail-soft "recompute after the write" hook AFTER the response is sent (`after()`), so the adult sees "Đã lưu" at once instead of
 * waiting for the engine. The hooks never throw by design; this adds one more net so nothing can escape unhandled inside `after`:
 * an error is written to app_errors (engine_deferred) and swallowed. Handlers still `await` the hook as before (it returns at once).
 */
/**
 * Per-child tail of the hook queue (in this server process). Two writes for the same child close together would otherwise run their recomputes
 * at the same time, and an older run that read its inputs earlier could apply LAST. Chaining them per child makes each run read its inputs after
 * the previous one has finished. Across separate server instances the database lock on the child's row is still the guard; if that ever lets an
 * older run win, "Tính lại từ đầu" (rebuild) restores the right state (DESIGN 19.16).
 */
const tails = new Map<string, Promise<void>>();

function serialised(key: string | null, job: () => Promise<void>): Promise<void> {
  if (key === null) return job();
  const prev = tails.get(key) ?? Promise.resolve();
  const next = prev.then(job, job);
  tails.set(key, next);
  void next.finally(() => {
    if (tails.get(key) === next) tails.delete(key);
  });
  return next;
}

export function deferHook<A extends unknown[]>(
  hook: (...a: A) => Promise<void>,
  ctx: { route: string; userId: string | null },
  schedule: (job: () => Promise<void>) => void = (job) => after(job),
): (...a: A) => Promise<void> {
  return async (...a) => {
    // Every recompute hook takes the child's id first; anything else runs unqueued.
    const key = typeof a[0] === "string" ? a[0] : null;
    schedule(() =>
      serialised(key, async () => {
        try {
          await hook(...a);
        } catch (error) {
          await logAppError({ route: ctx.route, code: "engine_deferred", error, userId: ctx.userId });
        }
      }),
    );
  };
}
