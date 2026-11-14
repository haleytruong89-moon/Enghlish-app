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
  it("two runs for the same child never overlap and run in the order they were queued; another child is not held back", async () => {
    const jobs: Array<() => Promise<void>> = [];
    const log: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const hook = vi.fn(async (l: string, tag: string) => {
      log.push(`start ${l}${tag}`);
      if (tag === "1") await gate;
      log.push(`end ${l}${tag}`);
    });
    const run = deferHook(hook, ctx, (j) => void jobs.push(j));
    await run("A", "1");
    await run("A", "2");
    await run("B", "1");
    const all = jobs.map((j) => j());
    await new Promise((r) => setTimeout(r, 10));
    expect(log).toEqual(["start A1", "start B1"]); // A2 waits for A1; B1 started at once and waits for the same gate
    release();
    await Promise.all(all);
    expect(log.indexOf("end A1")).toBeLessThan(log.indexOf("start A2"));
  });
  it("a failed run does not block the next one for the same child", async () => {
    const jobs: Array<() => Promise<void>> = [];
    const hook = vi.fn(async (_l: string, n: number) => {
      if (n === 1) throw new Error("boom");
    });
    const run = deferHook(hook, ctx, (j) => void jobs.push(j));
    await run("C", 1);
    await run("C", 2);
    await Promise.all(jobs.map((j) => j()));
    expect(hook).toHaveBeenCalledTimes(2);
  });
});
