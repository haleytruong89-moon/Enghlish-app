import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionCards, cardText } from "@/components/results/ActionCards";
import { parseResultTab, ResultsView } from "@/components/results/ResultsView";
import { StudioAssignedTable } from "@/components/studio/StudioAssignedTable";
import { fallbackLabels, resultsCopy as c } from "@/lib/copy/vi";
import type { ActionCard } from "@/lib/results/actions";
import { byTag, byUnit, scoreWork, type ItemRow } from "@/lib/results/score";
import type { StudioAssignedRow } from "@/lib/studio/assigned";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

const L = "f0000000-0000-4000-8000-00000000b001";
const grade: ActionCard = { key: "grade", kind: "grade", tone: "red", facts: { works: 3, pendingItems: 14, feedbackMissing: 5, oldestDays: 10, title: "Review 1" }, href: "/review/studio#studio-t3" };
const practise: ActionCard = { key: "tag-dang-tu", kind: "practise", tone: "amber", facts: { tag: "dang-tu", correct: 15, decided: 40, percent: 38, works: 3 }, href: `/learners/${L}/assign` };

describe("Việc nên làm cards", () => {
  it("tutor: each card says why with its numbers and has one button; urgency is a word, not only a colour", () => {
    const h = renderToStaticMarkup(createElement(ActionCards, { learnerId: L, cards: [grade, practise], tagLabels: { "dang-tu": "Dạng từ" }, role: "tutor" }));
    expect(h).toContain(c.cards.grade.title(3, 10));
    expect(h).toContain("14 câu cần thầy/cô chấm · 5 bài chưa góp ý");
    expect(h).toContain(c.tone.red);
    expect(h).toContain('data-testid="action-button-grade"');
    expect(h).toContain('href="/review/studio#studio-t3"');
    expect(h).toContain("Cho con luyện thêm: Dạng từ");
    expect(h).toContain(`href="/learners/${L}/progress"`);
  });
  it("parent: the same cards, no buttons, a line saying they are the tutor's", () => {
    const h = renderToStaticMarkup(createElement(ActionCards, { learnerId: L, cards: [grade], tagLabels: {}, role: "parent" }));
    expect(h).toContain(c.parentNote);
    expect(h).not.toContain("action-button-");
  });
  it("buttons can be turned off (session page); unknown tag → the standard fallback word; unreadable → said", () => {
    expect(renderToStaticMarkup(createElement(ActionCards, { learnerId: L, cards: [grade], tagLabels: {}, role: "tutor", buttons: false }))).not.toContain("action-button-");
    expect(cardText(practise, {}).title).toBe(c.cards.practise.title(fallbackLabels.tag));
    expect(renderToStaticMarkup(createElement(ActionCards, { learnerId: L, cards: null, tagLabels: {}, role: "tutor" }))).toContain(c.actionsUnavailable);
  });
});

describe("Kết quả page views", () => {
  const items = (spec: string, part: string, tag: string): ItemRow[] => [...spec].map((ch, i) => ({ id: `q${i + 1}`, n: i + 1, part, tag, kind: "gap", state: ch === "1" ? "correct" : ch === "0" ? "incorrect" : "pending" }));
  const w = scoreWork({
    instanceId: "i1", activityId: "a1", title: "Unit 15 - A, B, C, E", units: ["U15"], submittedAt: "2026-11-24T04:53:00Z", attempts: 1, firstAttemptId: "t1", lastAttemptId: "t1",
    episodeId: "e1", feedbackGiven: false, feedbackReady: true, official: null, items: [...items("1111?", "A", "dang-tu"), ...items("0000", "E", "so-sanh")], partNames: new Map([["A", "Adjectives"], ["E", "Comparatives"]]),
  }, "2026-11-26");
  const props = { learnerId: L, works: [w], units: byUnit([w], 4), tags: byTag([w]), tagLabels: { "dang-tu": "Dạng từ" } };
  it("Theo bài: provisional score, pending questions, each part, missing feedback", () => {
    const h = renderToStaticMarkup(createElement(ResultsView, { ...props, tab: "work" }));
    expect(h).toContain(c.provisional);
    expect(h).toContain(c.score(4, 8));
    expect(h).toContain(c.pending(1));
    expect(h).toContain("Comparatives");
    expect(h).toContain(c.feedbackMissing);
    expect(h).toContain('href="/review/e1"');
  });
  it("Theo Unit and Theo mục kiến thức", () => {
    expect(renderToStaticMarkup(createElement(ResultsView, { ...props, tab: "unit" }))).toContain('data-testid="results-unit-U15"');
    const t = renderToStaticMarkup(createElement(ResultsView, { ...props, tab: "tag" }));
    expect(t).toContain("Dạng từ");
    expect(t).toContain(fallbackLabels.tag); // so-sanh has no label in this map
  });
  it("tab parsing and the empty state", () => {
    expect([parseResultTab("unit"), parseResultTab("tag"), parseResultTab("x"), parseResultTab(undefined)]).toEqual(["unit", "tag", "work", "work"]);
    expect(renderToStaticMarkup(createElement(ResultsView, { ...props, works: [], tab: "work" }))).toContain(c.empty);
  });
});

describe("Bài đã giao: provisional score", () => {
  const row = { instanceId: "i1", activityId: "a1", title: "Unit 15", items: 40, startOn: null, dueOn: "2026-11-24", assignedAt: "2026-11-22T00:00:00Z", status: "waiting", lateDays: null, removedReason: null, attempts: 1, lastAttemptId: "t1", lastSubmittedAt: "2026-11-24T04:53:00Z", episodeId: "e1", feedbackGiven: false, feedbackReady: true, units: [], firstResult: null } as StudioAssignedRow;
  it("shows 'tạm: đúng x/y · n câu chờ thầy/cô' only while there is no official result", () => {
    const scores = new Map([["i1", { correct: 16, decided: 39, pending: 1 }]]);
    expect(renderToStaticMarkup(createElement(StudioAssignedTable, { rows: [row], scores }))).toContain(c.provisionalLine(16, 39, 1));
    expect(renderToStaticMarkup(createElement(StudioAssignedTable, { rows: [{ ...row, firstResult: { correct: 7, total: 23 } }], scores }))).not.toContain("studio-assigned-provisional");
  });
});
