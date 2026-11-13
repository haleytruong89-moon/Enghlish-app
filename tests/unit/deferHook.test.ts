import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
const logAppError = vi.fn(async () => undefined);
vi.mock("@/lib/ops/logAppError", () => ({ logAppError: (...a: unknown[]) => (logAppError as (...x: unknown[]) => Promise<void>)(...a) }));

const { deferHook } = await import("@/lib/engine/defer");

describe("deferHook", () => {
  const ctx = { route: "r", userId: "u" };
  it("returns before the hook runs; the queued job runs it with the same arguments", async () => {
    const jobs: Array<() => Promise<void>> = [];
    const hook = vi.fn(async (_l: string, _t: string[] | null) => undefined);
    const run = deferHook(hook, ctx, (j) => void jobs.push(j));
    await run("L1", ["T1"]);
    expect(hook).not.toHaveBeenCalled();
    expect(jobs).toHaveLength(1);
    await jobs[0]!();
    expect(hook).toHaveBeenCalledWith("L1", ["T1"]);
  });
  it("a hook that throws is logged as engine_deferred and never escapes the job", async () => {
    const jobs: Array<() => Promise<void>> = [];
    const run = deferHook(async () => { throw new Error("boom"); }, ctx, (j) => void jobs.push(j));
    await run();
    await expect(jobs[0]!()).resolves.toBeUndefined();
    expect(logAppError).toHaveBeenCalledWith(expect.objectContaining({ route: "r", code: "engine_deferred", userId: "u" }));
  });
  it("uses next/server after() by default", async () => {
    const { after } = await import("next/server");
    await deferHook(async () => undefined, ctx)();
    expect(after).toHaveBeenCalledTimes(1);
  });
});
