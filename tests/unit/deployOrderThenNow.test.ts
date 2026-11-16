import { beforeEach, describe, expect, it, vi } from "vitest";

/** Deploy order: the code of W4e may reach production BEFORE migration 0036 is applied. Nothing may fail loudly; the cards are simply left out. */
const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/supabase/server", () => ({ createUserClient: async () => ({ rpc }) }));

const MISSING = { data: null, error: { code: "PGRST202", message: "none" } };
beforeEach(() => {
  rpc.mockReset();
});

describe("before 0036", () => {
  it("the child's three reads give nothing (no card, no error page); a real fault or a network fault is nothing too", async () => {
    const { loadMyGrowth } = await import("@/lib/student/growthLoad");
    rpc.mockResolvedValue(MISSING);
    expect(await loadMyGrowth()).toEqual({ levels: null, cando: null, candoEver: {}, thenNow: null });
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    expect(await loadMyGrowth()).toEqual({ levels: null, cando: null, candoEver: {}, thenNow: null });
    rpc.mockImplementation(() => Promise.reject(new Error("network")));
    expect(await loadMyGrowth()).toEqual({ levels: null, cando: null, candoEver: {}, thenNow: null });
  });
  it("a malformed answer (a key a child must never get) is nothing, never shown", async () => {
    const { loadMyGrowth } = await import("@/lib/student/growthLoad");
    rpc.mockResolvedValue({ data: { domains: [{ key: "g", name: "G", level: "B1", on: "2026-11-07T03:00:00Z", score: 3 }] }, error: null });
    expect((await loadMyGrowth()).levels).toBeNull();
  });
  it("after 0036: the three reads give the cards; the Track A skill gets the name for the student", async () => {
    const { loadMyGrowth } = await import("@/lib/student/growthLoad");
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "eng_my_levels") return { data: { domains: [{ key: "grammar", name: "Ngữ pháp", level: "B2", on: "2026-11-07T03:00:00Z" }] }, error: null };
      if (fn === "eng_my_cando") return { data: { now: "2026-11-16T03:00:00Z", items: [{ code: "A-T1-TEXT-R", name: "Đọc hiểu bài ngắn", at: "2026-11-15T03:00:00Z" }], ever: [{ n: 5, at: "2026-11-01T03:00:00Z" }] }, error: null };
      return { data: null, error: null };
    });
    const g = await loadMyGrowth();
    expect(g.levels?.tiles[0]).toMatchObject({ level: "B2" });
    expect(g.cando?.[0]).toMatchObject({ text: "Hiểu bài đọc", isNew: true });
    expect(g.candoEver).toEqual({ 5: "2026-11-01T03:00:00Z" });
    expect(g.thenNow).toBeNull();
    expect(rpc).toHaveBeenCalledWith("eng_my_levels");
  });
  it("the adult list: not applied → { available: false }, a fault → { available: false, failed: true }; the pick answers 409 thennow_unavailable", async () => {
    const { loadThenNowCandidates } = await import("@/lib/thennow/load");
    rpc.mockResolvedValue(MISSING);
    expect(await loadThenNowCandidates("L")).toEqual({ available: false });
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    expect(await loadThenNowCandidates("L")).toEqual({ available: false, failed: true });
    const { createSupabaseThenNowStore } = await import("@/lib/thennow/supabaseStore");
    rpc.mockResolvedValue(MISSING);
    await expect(createSupabaseThenNowStore().pick({ learnerId: "L", thenId: "a", nowId: "b", note: null, status: "shown", byMemberId: "m", clientId: "client-0001" })).rejects.toMatchObject({ code: "thennow_unavailable" });
  });
});
