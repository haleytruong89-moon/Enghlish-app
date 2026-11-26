import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));

import { UnitStatusTable } from "@/components/curriculum/UnitStatusTable";
import { ActionCards } from "@/components/results/ActionCards";
import { curriculumCopy, resultsCopy } from "@/lib/copy/vi";
import type { ActionCard } from "@/lib/results/actions";

const L = "b0000000-0000-4000-8000-000000000001";
const units = [13, 14, 15].map((n) => ({ code: `U${n}`, ord: n, title: `Unit ${n}`, skipped: false, section: null, page: null, points: [] }));

describe("L2 screens", () => {
  it("a unit the app set from work sent says so, with the day (Vietnam time)", () => {
    const h = renderToStaticMarkup(createElement(UnitStatusTable, { curriculumId: "c1", units, statusOf: { U13: "done", U14: "in_progress", U15: "not_started" }, autoOf: { U14: "2026-11-23T18:30:00Z" } }));
    expect(h).toContain('data-testid="unit-U14-auto"');
    expect(h).toContain(curriculumCopy.autoBadge("24/11"));
    expect(h).not.toContain('data-testid="unit-U13-auto"');
  });
  it("'có thể Đã học': the tutor gets the one-click button, the parent only reads", () => {
    const card: ActionCard = { key: "ready-U15", kind: "unit_ready", tone: "info", facts: { unit: "U15", correct: 15, decided: 20, percent: 75, works: 2, curriculumId: "c1" }, href: `/learners/${L}/curricula/c1`, evidenceAt: "2026-11-24T03:00:00Z" };
    const t = renderToStaticMarkup(createElement(ActionCards, { learnerId: L, cards: [card], tagLabels: {}, role: "tutor" }));
    expect(t).toContain(resultsCopy.cards.unit_ready.title("U15"));
    expect(t).toContain('data-testid="unit-done-U15"');
    expect(t).not.toContain("card-decision-"); // not a Đã làm / Bỏ qua card
    const p = renderToStaticMarkup(createElement(ActionCards, { learnerId: L, cards: [card], tagLabels: {}, role: "parent" }));
    expect(p).not.toContain('data-testid="unit-done-U15"');
  });
});
