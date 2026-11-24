import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BoardTabs } from "@/components/assigned/BoardTabs";
import { assignedBoardCopy as c } from "@/lib/copy/vi";

describe("Bài đã giao: the tab row", () => {
  it("four links with counts; only the open one is marked current; ≥44px", () => {
    const h = renderToStaticMarkup(createElement(BoardTabs, { learnerId: "L1", tab: "doing", counts: { need: 2, doing: 3, done: 1, removed: 0 } }));
    for (const t of ["need", "doing", "done", "removed"] as const) expect(h).toContain(`href="/learners/L1/assigned?tab=${t}"`);
    expect(h).toContain(c.tabCount(c.tab.need, 2));
    expect(h).toContain(c.tabCount(c.tab.removed, 0));
    expect(h.match(/aria-current="page"/g)).toHaveLength(1);
    expect(h).toMatch(/aria-current="page"[^>]*data-testid="board-tab-doing"/);
    expect(h).toContain("min-h-11");
  });
});
