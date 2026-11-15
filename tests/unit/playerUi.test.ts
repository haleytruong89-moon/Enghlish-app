import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement("a", { href, ...rest }, children as never) }));

import { AskTutorSlot } from "@/components/student/player/AskTutorSlot";
import { Player } from "@/components/student/player/Player";
import { ResultView } from "@/components/student/player/ResultView";
import { playerCopy, resultCopy, retryCopy, tutorHonorific } from "@/lib/copy/vi";
import type { ResultView as ResultData } from "@/lib/student/result";
import type { SupportedActivityView } from "@/lib/work/types";

const result = (over: Partial<ResultData> = {}): ResultData => ({
  attemptNo: 1, submittedAt: "2026-11-15T03:00:00Z", isTest: false, othersFine: true,
  look: [{ id: "q2", n: 2, stem: "She ___ be at home.", given: "B. can't", retryText: null, canRetry: true }, { id: "q5", n: 5, stem: "Why?", given: "", retryText: "B", canRetry: false }],
  open: [{ id: "q7", n: 7, stem: "Write one sentence", given: "I wish I could" }],
  ...over,
});
const html = (r: ResultData, canRedo = true) => renderToStaticMarkup(createElement(ResultView, { activityId: "a1", title: "Unit 5", result: r, items: [{ id: "q2", kind: "mcq", options: ["A. must", "B. can't"] }], canRedo, onRedo: () => {} }));
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the result screen (S-10)", () => {
  it("says plainly that the work was already sent (also when reopened) and has no submit button", () => {
    for (const isTest of [false, true]) {
      const h = html(result({ isTest }));
      expect(h).toContain('data-testid="already-submitted"');
      expect(text(h)).toContain("Bạn đã nộp bài này lúc");
      expect(h).not.toContain("player-submit");
    }
  });
  it("practice: what the child wrote, one retry button, a sent retry, the free items, one 'rest is fine' line - no score, answer, count", () => {
    const h = html(result());
    const t = text(h);
    expect(t).toContain(resultCopy.title);
    expect(t).toContain(resultCopy.lookTitle);
    expect(h).toContain("B. can&#x27;t");
    expect(t).toContain(resultCopy.notAnswered);
    expect(h).toContain('data-testid="retry-open-q2"');
    expect(h).not.toContain('data-testid="retry-open-q5"'); // already retried
    expect(t).toContain(retryCopy.sent);
    expect(t).toContain(resultCopy.openNote);
    expect(t).toContain(resultCopy.othersFine);
    // the "Bạn đã nộp bài này lúc 10:00 ngày 15/11/2026." line is a date, not a ratio
    expect(t.replace(/Bạn đã nộp bài này lúc[^.]*\./, "")).not.toMatch(/\d+\s*\/\s*\d+|%|điểm|đúng\s+\d|nên là|vì sao|đáp án đúng/i);
    expect(t).toMatch(/Bạn đã nộp bài này lúc \d{2}:\d{2} ngày \d{2}\/\d{2}\/\d{4}\./); // the date AND the time
    expect(t).toContain(resultCopy.again);
  });
  it("test: its own heading and note, no retry button, no 'again'", () => {
    const h = html(result({ isTest: true, look: result().look.map((x) => ({ ...x, canRetry: true, retryText: null })) }), false);
    const t = text(h);
    expect(t).toContain(resultCopy.lookTitleTest);
    expect(t).toContain(resultCopy.testNote);
    expect(h).not.toContain("retry-open-");
    expect(t).not.toContain(resultCopy.again);
    expect(t).not.toContain(resultCopy.lookIntro);
    expect(t).toContain(tutorHonorific);
  });
  it("nothing to look at says so in one line", () => {
    expect(text(html(result({ look: [], open: [] })))).toContain(resultCopy.nothing);
  });
});

describe("the hint slot", () => {
  it("is dimmed, disabled and explains itself", () => {
    const h = renderToStaticMarkup(createElement(AskTutorSlot));
    expect(h).toContain("disabled");
    expect(h).toContain('aria-disabled="true"');
    expect(text(h)).toContain(`${playerCopy.askTutor} · ${playerCopy.askTutorSoon}`);
    expect(text(h)).toContain(playerCopy.askTutorNote);
  });
});

describe("the player", () => {
  const activity: SupportedActivityView = {
    supported: true, activityId: "a1", instanceId: "i1", stepNo: 1, activityType: "ACT-SOURCE-QA", mode: "PRACTICE", purpose: [], date: "2026-11-15", titleVi: "Unit 5",
    bigQuestionEn: "", bigQuestionVi: "", shape: "answers", canSubmit: true,
    step: { promptEn: "p", timeMin: null, selfCheckVi: [], items: [{ id: "q1", kind: "mcq", stem: "Pick", options: ["A. x", "B. y"] }, { id: "q2", kind: "gap", stem: "Fill", options: [] }] },
    attempts: [], draft: { content: { answers: { q1: "A. x" } }, revision: 1, updatedAt: "2026-11-15T01:00:00Z" }, sources: [],
  };
  const render = (isTest: boolean) => renderToStaticMarkup(createElement(Player, { activity, isTest, initialResult: null }));
  it("practice: opens on the first question without an answer, counts answered questions only, shows the dimmed slot and no test line", () => {
    const h = render(false);
    expect(h).toContain('data-testid="question-q2"'); // q1 has an answer → opens on q2
    expect(h).not.toContain('data-testid="question-q1"');
    expect(text(h)).toContain(playerCopy.progress(1, 2));
    expect(h).toContain('data-count="work"');
    expect(h).toContain('data-testid="ask-tutor"');
    expect(h).not.toContain('data-testid="test-line"');
    expect(text(h)).toContain("Đã lưu");
  });
  it("test: the test line, no hint slot", () => {
    const h = render(true);
    expect(h).toContain('data-testid="test-line"');
    expect(h).not.toContain('data-testid="ask-tutor"');
    expect(text(h)).toContain(playerCopy.testLineBold);
  });
  it("the dots are 44 px high buttons with a text label (not colour alone)", () => {
    const h = render(false);
    expect(h).toContain("h-11");
    expect(h).toContain(playerCopy.dotAnswered(1));
    expect(h).toContain(playerCopy.dotEmpty(2));
  });
});

describe("the result screen of a practice work (D39): marks, retry or the answer", () => {
  const m = (over: Record<string, unknown>) => ({ id: "q1", n: 1, stem: "s1", given: "x", mark: "right", retry: null, revealed: false, canRetry: false, canReveal: false, answer: null, why: null, ...over });
  const marks = [
    m({}),
    m({ id: "q2", n: 2, mark: "wrong", canRetry: true, canReveal: true, stem: "She ___ be at home." }),
    m({ id: "q3", n: 3, mark: "wrong", revealed: true, answer: "A. must", why: "Vì đoán chắc chắn." , retry: { text: "A. must", mark: "right" } }),
    m({ id: "q4", n: 4, mark: "waiting" }),
    m({ id: "q5", n: 5, mark: "right", why: "Vì thế." }),
  ];
  const h = renderToStaticMarkup(createElement(ResultView, { activityId: "a1", title: "Unit 5", result: result({ marks: marks as never }), items: [], canRedo: true, onRedo: () => {} }));
  it("each item has a coloured box AND words: ✓ Đúng / ✗ Chưa đúng / the tutor will read", () => {
    expect(h).toContain('data-mark="right"');
    expect(h).toContain('data-mark="wrong"');
    expect(h).toContain('data-mark="waiting"');
    for (const w of [resultCopy.markRight, resultCopy.markWrong, resultCopy.markWaiting]) expect(text(h)).toContain(w);
  });
  it("an unrevealed wrong item offers a retry and 'Xem đáp án'; the answer shows only where the server sent it", () => {
    expect(h).toContain('data-testid="retry-open-q2"');
    expect(h).toContain('data-testid="reveal-q2"');
    expect(h).not.toContain('data-testid="answer-q2"');
    expect(text(h)).toContain("Đáp án: A. must");
    expect(h).toContain('data-testid="retry-mark-q3"');
    expect(text(h)).toContain(resultCopy.retryRight);
    expect(h).not.toContain('data-testid="reveal-q3"');
  });
  it("a right item keeps its 'Vì sao' collapsed; no total, count, percentage or score anywhere", () => {
    expect(h).toMatch(/<details[^>]*data-testid="why-q5"/);
    expect(h.replace(/<p data-testid="already-submitted"[^>]*>[^<]*<\/p>/, "")).not.toMatch(/\d+\s*\/\s*\d+|%|đúng\s+\d|điểm/i);
    expect(h).not.toContain("result-others-fine");
  });
  it("a test (no marks) shows none of this", () => {
    const t = renderToStaticMarkup(createElement(ResultView, { activityId: "a1", title: "Unit 5", result: result({ isTest: true, marks: null, look: [], open: [] }), items: [], canRedo: false, onRedo: () => {} }));
    expect(t).not.toContain("result-marks");
    expect(t).not.toContain("reveal-");
  });
});
