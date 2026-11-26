import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BoardTabs } from "@/components/assigned/BoardTabs";
import { DraftGroups } from "@/components/assigned/DraftGroups";
import { assignedBoardCopy as c } from "@/lib/copy/vi";
import type { DraftGroup } from "@/lib/assigned/draftGroups";

const counts = { need: 2, doing: 3, done: 1, removed: 4, drafts: 7 };

describe("Bài tập: the tab row (hướng B)", () => {
  it("four visible tabs: Cần chấm · Con đang làm · Đã xong · Bản nháp; Đã gỡ is not a tab", () => {
    const h = renderToStaticMarkup(createElement(BoardTabs, { learnerId: "L1", tab: "doing", counts }));
    for (const t of ["need", "doing", "done", "drafts"] as const) expect(h).toContain(`href="/learners/L1/assigned?tab=${t}"`);
    expect(h).not.toContain("tab=removed");
    expect(c.tab.need).toBe("Cần chấm");
    expect(h).toContain(c.tabCount(c.tab.drafts, 7));
    expect(h.match(/aria-current="page"/g)).toHaveLength(1);
    expect(h).toContain("min-h-11");
  });
  it("the 'removed' tab, opened from its link, still marks nothing wrong", () => {
    const h = renderToStaticMarkup(createElement(BoardTabs, { learnerId: "L1", tab: "removed", counts }));
    expect(h.match(/aria-current="page"/g) ?? []).toHaveLength(0);
  });
});

describe("Bài tập › Bản nháp: groups by Unit", () => {
  const g = (over: Partial<DraftGroup>): DraftGroup => ({ key: "U15", unitKey: "U15", status: "in_progress", next: true, drafts: [], ...over });
  const draft = (id: string, title: string, status: "approved" | "draft" = "approved") => ({ id, title, status, updatedAt: "2026-11-20T00:00:00Z", templateId: null, templateVersion: null, superseded: false, assigned: 0 });
  it("the next Unit first, badged; each draft links to its page; other groups folded", () => {
    const h = renderToStaticMarkup(createElement(DraftGroups, {
      groups: [g({ drafts: [draft("d1", "Unit 15 · Part 2")] }), g({ key: "U16", unitKey: "U16", status: "not_started", next: false, drafts: [draft("d2", "Unit 16 · Idioms", "draft")] }), g({ key: "other", unitKey: null, status: null, next: false, drafts: [draft("d3", "Mixed")] })],
    }));
    expect(h.indexOf('data-testid="draft-group-U15"')).toBeLessThan(h.indexOf('data-testid="draft-group-U16"'));
    expect(h).toContain('data-testid="draft-next"');
    expect(h).toContain(c.draftNext);
    expect(h).toContain('href="/studio/drafts/d1"');
    expect(h).toContain(c.draftGroup("U16"));
    expect(h).toContain(c.draftGroup("other"));
    expect(h).toMatch(/<details[^>]*data-testid="draft-group-U16"/);
    expect(h).toMatch(/<details[^>]*open=""[^>]*data-testid="draft-group-U15"|data-testid="draft-group-U15"[^>]*open=""/);
  });
  it("empty: the empty line", () => {
    expect(renderToStaticMarkup(createElement(DraftGroups, { groups: [] }))).toContain(c.empty.drafts);
  });
});
