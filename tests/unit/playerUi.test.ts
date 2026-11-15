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
    expect(t).not.toMatch(/\d+\s*\/\s*\d+|%|điểm|đúng\s+\d|nên là|vì sao|đáp án đúng/i);
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
