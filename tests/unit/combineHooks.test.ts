import { describe, expect, it, vi } from "vitest";
import { combineHooks } from "@/lib/engine/combine";

describe("combineHooks", () => {
  it("runs every hook in order with the same arguments", async () => {
    const order: string[] = [];
    const a = vi.fn(async () => void order.push("a"));
    const b = vi.fn(async () => void order.push("b"));
    await combineHooks(a, b)("L1", ["T1"]);
    expect(order).toEqual(["a", "b"]);
    expect(b).toHaveBeenCalledWith("L1", ["T1"]);
  });
});
