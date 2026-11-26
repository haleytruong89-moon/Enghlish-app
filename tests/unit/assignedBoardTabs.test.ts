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
  it("drafts unreadable: the tab shows its name without a number (never a false 0)", () => {
    const h = renderToStaticMarkup(createElement(BoardTabs, { learnerId: "L1", tab: "need", counts: { ...counts, drafts: null } }));
    expect(h).toMatch(/data-testid="board-tab-drafts"[^>]*>Bản nháp<\/a>/);
  });
  it("the 'removed' tab, opened from its link, still marks nothing wrong", () => {
    const h = renderToStaticMarkup(createElement(BoardTabs, { learnerId: "L1", tab: "removed", counts }));
    expect(h.match(/aria-current="page"/g) ?? []).toHaveLength(0);
  });
});

describe("Bản nháp (Giao bài + Bài tập, v2): Sẵn sàng giao first, then by Unit", () => {
  const g = (over: Partial<DraftGroup>): DraftGroup => ({ key: "U15", unitKey: "U15", status: "in_progress", next: true, closed: false, drafts: [], ...over });
  const draft = (id: string, title: string, status: "approved" | "draft" | "extracting" = "draft") => ({ id, title, status, updatedAt: "2026-11-20T00:00:00Z", templateId: null, templateVersion: null, superseded: false, assigned: 0 });
  const board = {
    ready: [{ draft: draft("r1", "Unit 15 · 1 · Adjective", "approved"), unitKey: "U15", status: "in_progress" as const, next: true }],
    groups: [
      g({ drafts: [draft("d1", "Unit 15 · Part 2")] }),
      g({ key: "U16", unitKey: "U16", status: "not_started", next: false, drafts: [draft("d2", "Unit 16 · Idioms"), draft("d4", "Unit 16 · 2", "extracting")] }),
      g({ key: "review", unitKey: null, status: null, next: false, drafts: [draft("d5", "Review 13")] }),
      g({ key: "other", unitKey: null, status: null, next: false, drafts: [draft("d3", "Mixed")] }),
    ],
  };
  it("ready section on top with a strong 'Giao →' that opens the giving form; then Kế tiếp open, the rest folded", () => {
    const h = renderToStaticMarkup(createElement(DraftGroups, { board }));
    expect(h.indexOf('data-testid="drafts-ready"')).toBeLessThan(h.indexOf('data-testid="draft-group-U15"'));
    expect(h).toContain(c.readyTitle(1));
    expect(h).toMatch(/data-testid="draft-give-r1"[^>]*class="[^"]*bg-accent[^"]*text-white[^"]*"[^>]*href="\/studio\/drafts\/r1#assign"/);
    expect(h).toContain(c.giveAction);
    expect(h).toContain('data-testid="ready-next"');
    expect(h.indexOf('data-testid="draft-group-U15"')).toBeLessThan(h.indexOf('data-testid="draft-group-U16"'));
    expect(h).toContain('data-testid="draft-next"');
    expect(h).toMatch(/<details open=""[^>]*data-testid="draft-group-U15"/);
    expect(h).toMatch(/<details[^>]*data-testid="draft-group-U16"/);
    expect(h).not.toMatch(/<details open=""[^>]*data-testid="draft-group-U16"/);
    expect(h).toContain(c.draftGroup("review"));
    expect(h).toContain(c.draftGroup("other"));
  });
  it("each draft has a visible action: Duyệt for a draft, Mở while it is being read; 44 px", () => {
    const h = renderToStaticMarkup(createElement(DraftGroups, { board }));
    expect(h).toMatch(new RegExp(`aria-label="${c.actionLabel(c.reviewAction, "Unit 15 · Part 2")}"[^>]*data-testid="draft-action-d1"[^>]*min-h-11`));
    expect(h.match(/href="\/studio\/drafts\/d1"/g)).toHaveLength(1); // one link per row
    expect(h).toMatch(new RegExp(`aria-label="${c.actionLabel(c.openAction, "Unit 16 · 2")}"`));
  });
  it("nothing to show: the empty line", () => {
    expect(renderToStaticMarkup(createElement(DraftGroups, { board: { ready: [], groups: [] } }))).toContain(c.empty.drafts);
  });
});
