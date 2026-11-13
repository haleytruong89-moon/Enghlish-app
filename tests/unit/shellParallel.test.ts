import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const loadHome = vi.fn(async () => {
  await wait(50);
  return { kind: "parent" as const, displayName: "Mẹ", memberId: "m", learners: [{ id: "L1", alias: "An", trackId: "A" as const, status: "active" as const, isTest: true, color: null }] };
});
vi.mock("@/lib/home/loadHome", () => ({ loadHome: () => loadHome() }));
vi.mock("@/lib/revision/load", () => ({ revisionsAvailable: async () => true }));

const { withShell } = await import("@/lib/shell/parallel");

describe("withShell", () => {
  it("reads the shell while the page loads: about one read time, not two", async () => {
    const t0 = Date.now();
    const r = await withShell((async () => { await wait(50); return { learner: "L1" }; })(), (d) => d.learner);
    expect(Date.now() - t0).toBeLessThan(90);
    expect(r.shell?.current?.id).toBe("L1");
    expect(r.shell?.role).toBe("parent");
  });
  it("shell is null for a signed-out account and for a student", async () => {
    loadHome.mockResolvedValueOnce({ kind: "signed-out" } as never);
    expect((await withShell(Promise.resolve(1), () => null)).shell).toBeNull();
    loadHome.mockResolvedValueOnce({ kind: "student", displayName: "x", memberId: "s", learners: [] } as never);
    expect((await withShell(Promise.resolve(1), () => null)).shell).toBeNull();
  });
});
