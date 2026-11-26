import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }), usePathname: () => "/" }));

import { QueueStrip } from "@/components/finish/QueueStrip";
import { ActionCards } from "@/components/results/ActionCards";
import { WorkList } from "@/components/results/WorkList";
import { finishCopy, resultsCopy } from "@/lib/copy/vi";
import { partAnchor } from "@/lib/finish/paths";
import type { ActionCard } from "@/lib/results/actions";
import type { WorkScore } from "@/lib/results/score";

const L = "b0000000-0000-4000-8000-000000000001";

describe("Bản 3 · 1: the queue at the top of Chấm và góp ý", () => {
  const entries = [
    { attemptId: "a1", title: "Destination C1 C2 Review 1", waited: 11 },
    { attemptId: "a2", title: "Unit 14 · Phrases", waited: 10 },
    { attemptId: "a3", title: "Unit 15 · A, B, C, E", waited: 0 },
  ];
  it("says how many are left and why, one chip per work (oldest first), the open one marked, a strong Bài sau", () => {
    const h = renderToStaticMarkup(createElement(QueueStrip, { learnerId: L, entries, currentId: "a1", nextHref: `/learners/${L}/finish/a2` }));
    expect(h).toContain(finishCopy.queueTitle(3));
    expect(h).toContain(finishCopy.queueWhy);
    expect(h.indexOf('data-testid="finish-queue-a1"')).toBeLessThan(h.indexOf('data-testid="finish-queue-a3"'));
    expect(h).toMatch(/aria-current="page"[^>]*data-testid="finish-queue-a1"/);
    expect(h).toContain(finishCopy.queueOpen(11));
    expect(h).toContain(finishCopy.queueWaited(0));
    expect(h).toMatch(/data-testid="finish-next-top"[^>]*class="[^"]*bg-accent/);
    expect(h).toContain(`href="/learners/${L}/finish/a3"`);
  });
  it("nothing left: one green line, no chips", () => {
    const h = renderToStaticMarkup(createElement(QueueStrip, { learnerId: L, entries: [], currentId: "a1", nextHref: null }));
    expect(h).toContain(finishCopy.queueEmpty);
    expect(h).not.toContain("finish-queue-a");
  });
});

describe("Bản 3 · 2: a fix-together suggestion opens the test at the weak part", () => {
  const card: ActionCard = {
    key: "fix-i1-E", kind: "fix_together", tone: "red", facts: { title: "Unit 15", part: "E · Comparatives", partKey: "E", correct: 0, decided: 10, percent: 0 },
    href: `/learners/${L}/notes/new#goi-y-buoi-hoc`, workHref: `/learners/${L}/finish/a1#${partAnchor("E")}`, evidenceAt: "2026-11-24T00:00:00Z",
  };
  it("on the session page (no other button): a strong 'Mở phần E để chữa →' to the part", () => {
    const h = renderToStaticMarkup(createElement(ActionCards, { learnerId: L, cards: [card], tagLabels: {}, role: "tutor", buttons: false }));
    expect(h).toContain(resultsCopy.openFix("E"));
    expect(h).toMatch(/data-testid="action-open-fix-i1-E"[^>]*class="[^"]*bg-accent[^"]*"[^>]*href="[^"]*\/finish\/a1#part-E"/);
  });
  it("on Hôm nay it sits beside the main button as a second one", () => {
    const h = renderToStaticMarkup(createElement(ActionCards, { learnerId: L, cards: [card], tagLabels: {}, role: "tutor" }));
    expect(h).toMatch(/data-testid="action-open-fix-i1-E"[^>]*class="[^"]*border-2 border-accent/);
  });
  it("the part anchor is a safe id", () => {
    expect(partAnchor("E")).toBe("part-E");
    expect(partAnchor("Phần 2 (H–N)")).toBe("part-Ph-n-2--H-N-");
    expect(partAnchor("")).toBe("part-all");
  });
});

describe("Bản 3 · 3: Từng bài, fixed columns", () => {
  const w = {
    instanceId: "i1", activityId: "a", title: "Destination C1, C2 - Unit 15 - A, B, C, E", units: [], submittedAt: "2026-11-24T03:00:00Z", attempts: 1, firstAttemptId: "f1", lastAttemptId: null,
    episodeId: null, feedbackGiven: false, feedbackReady: true, official: null, counted: true, unitKey: "U15", tally: { correct: 16, decided: 39, pending: 1 }, parts: [], tags: [],
    waitingDays: 2, needsAdult: true,
  } as WorkScore;
  it("a three-column grid (marker · title · score) so titles start on the left and scores line up on the right", () => {
    const h = renderToStaticMarkup(createElement(WorkList, { works: [w, { ...w, instanceId: "i2", parts: [{ key: "A", name: "A", tally: { correct: 1, decided: 2, pending: 0 } }] } as WorkScore] }));
    expect(h.match(/grid-cols-\[1rem_minmax\(0,1fr\)\][^"]*sm:grid-cols-\[1rem_minmax\(0,1fr\)_15rem\]/g)).toHaveLength(2);
    expect(h).toMatch(/data-testid="results-work-score-i1"[^>]*|class="col-start-2[^"]*sm:col-start-3[^"]*sm:text-right[^"]*" data-testid="results-work-score-i1"/);
    expect(h).not.toContain("justify-between");
  });
});
