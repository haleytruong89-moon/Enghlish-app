import { describe, expect, it } from "vitest";
import { itemStatus, onlyToCheck, orderByStatus } from "@/lib/review/itemStatus";

describe("tutor review: item status", () => {
  it("correct = right, incorrect / blank = wrong, needs_person / unknown = waiting", () => {
    expect(["correct", "incorrect", "blank", "needs_person", undefined, null].map(itemStatus)).toEqual(["right", "wrong", "wrong", "waiting", "waiting", "waiting"]);
  });
  it("wrong first, then waiting, then right; the original order is kept inside a group (the numbers stay)", () => {
    const rows = [1, 2, 3, 4, 5, 6].map((n) => ({ n, status: itemStatus(["correct", "incorrect", "needs_person", "correct", "blank", "needs_person"][n - 1]) }));
    expect(orderByStatus(rows).map((r) => r.n)).toEqual([2, 5, 3, 6, 1, 4]);
    expect(onlyToCheck(orderByStatus(rows)).map((r) => r.n)).toEqual([2, 5, 3, 6]);
  });
});
