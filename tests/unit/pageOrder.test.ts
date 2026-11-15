import { describe, expect, it } from "vitest";
import { addPages, arrangement, degrees, MAX_PAGES, movePage, removePage, rotatePage, type Paged } from "@/lib/practice/pageOrder";

const p = (key: string, quarter: 0 | 1 | 2 | 3 = 0): Paged => ({ key, quarter });
const keys = (xs: Paged[]) => xs.map((x) => x.key).join("");

describe("page order", () => {
  const three = [p("a"), p("b"), p("c")];

  it("moves a page up and down by one place and leaves the others in order", () => {
    expect(keys(movePage(three, "c", "up"))).toBe("acb");
    expect(keys(movePage(three, "a", "down"))).toBe("bac");
    expect(keys(movePage(movePage(three, "c", "up"), "c", "up"))).toBe("cab");
  });

  it("does nothing at the edges or for an unknown page, and never changes the input list", () => {
    expect(keys(movePage(three, "a", "up"))).toBe("abc");
    expect(keys(movePage(three, "c", "down"))).toBe("abc");
    expect(keys(movePage(three, "zzz", "up"))).toBe("abc");
    expect(keys(three)).toBe("abc");
  });

  it("deletes a page and keeps the order of the rest", () => {
    expect(keys(removePage(three, "b"))).toBe("ac");
    expect(keys(removePage(three, "zzz"))).toBe("abc");
    expect(removePage([p("a")], "a")).toEqual([]);
  });

  it("a quarter turn is clockwise and four turns come back; the other pages stay as they were", () => {
    const once = rotatePage(three, "b");
    expect(once.map((x) => x.quarter)).toEqual([0, 1, 0]);
    let x = three;
    for (let i = 0; i < 4; i++) x = rotatePage(x, "b");
    expect(x.map((y) => y.quarter)).toEqual([0, 0, 0]);
    expect(rotatePage(rotatePage(rotatePage(three, "a"), "a"), "a")[0]!.quarter).toBe(3);
    expect(degrees(3)).toBe(270);
  });

  it("order and turns survive each other: rotate, then move, then delete", () => {
    let x = rotatePage(three, "a");
    x = movePage(x, "a", "down");
    x = removePage(x, "c");
    expect(x).toEqual([p("b"), p("a", 1)]);
  });

  it("holds at most 12 pages and reports how many did not fit", () => {
    expect(MAX_PAGES).toBe(12);
    const ten = Array.from({ length: 10 }, (_, i) => p(`k${i}`));
    const r = addPages(ten, [p("x"), p("y"), p("z")]);
    expect(r.pages).toHaveLength(12);
    expect(r.dropped).toBe(1);
    expect(r.pages.slice(10).map((q) => q.key)).toEqual(["x", "y"]);
    expect(addPages([], [p("a")])).toEqual({ pages: [p("a")], dropped: 0 });
    expect(addPages(Array.from({ length: 12 }, (_, i) => p(`k${i}`)), [p("n")]).dropped).toBe(1);
  });

  it("the arrangement text changes with the order and the turns, so a changed arrangement is new work", () => {
    expect(arrangement(three)).toBe("a:0|b:0|c:0");
    expect(arrangement(movePage(three, "c", "up"))).not.toBe(arrangement(three));
    expect(arrangement(rotatePage(three, "a"))).not.toBe(arrangement(three));
    expect(arrangement(three)).toBe(arrangement([p("a"), p("b"), p("c")]));
  });
});
