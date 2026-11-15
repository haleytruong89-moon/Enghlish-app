import { describe, expect, it } from "vitest";
import { countNew, isNew, readOpened, seenMemoKey, writeOpened } from "@/lib/student/seenMemo";

const NOW = new Date("2026-11-15T03:00:00Z");

describe("the 'Mới' mark is remembered on this device (plan Q21)", () => {
  it("rows seen after the last opening are new; the opening time itself is not", () => {
    const seen = ["2026-11-14T09:00:00Z", "2026-11-14T10:00:00Z", "2026-11-14T11:00:00Z"];
    expect(countNew(seen, "2026-11-14T10:00:00Z", NOW)).toBe(1);
    expect(isNew("2026-11-14T11:00:00Z", "2026-11-14T10:00:00Z", NOW)).toBe(true);
    expect(isNew("2026-11-14T09:00:00Z", "2026-11-14T10:00:00Z", NOW)).toBe(false);
  });
  it("a device that never opened the tab: only the last 14 days are new", () => {
    expect(countNew(["2026-11-10T00:00:00Z", "2026-10-01T00:00:00Z"], null, NOW)).toBe(1);
    expect(countNew(["2026-11-10T00:00:00Z"], "not a date", NOW)).toBe(1);
  });
  it("reads / writes localStorage by child id, and never throws", () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(readOpened(store, "kid-1")).toBeNull();
    writeOpened(store, "kid-1", NOW);
    expect(mem.get(seenMemoKey("kid-1"))).toBe(NOW.toISOString());
    expect(readOpened(store, "kid-1")).toBe(NOW.toISOString());
    expect(readOpened(store, "kid-2")).toBeNull();
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("full"); } };
    expect(readOpened(broken, "kid-1")).toBeNull();
    expect(() => writeOpened(broken, "kid-1")).not.toThrow();
    expect(readOpened(null, "kid-1")).toBeNull();
  });
});
