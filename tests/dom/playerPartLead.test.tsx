import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Player } from "@/components/student/player/Player";
import { TaskLines } from "@/components/student/TaskLines";
import type { SupportedActivityView } from "@/lib/work/types";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const studio: SupportedActivityView = {
  supported: true, activityId: "act1", instanceId: "i1", stepNo: 1, activityType: "ACT-SOURCE-QA", mode: "PRACTICE", purpose: [], date: "2026-11-21", titleVi: "Unit 14",
  bigQuestionEn: "", bigQuestionVi: "", shape: "answers", canSubmit: true,
  step: {
    promptEn: "Questions 1–2 · A · Topic vocabulary: Choose the correct word.\nQuestion 3 · B · Word formation: Use the word in capitals.",
    timeMin: null, selfCheckVi: [],
    items: [
      { id: "q1", kind: "mcq", stem: "One ____.", options: ["A. x", "B. y"] },
      { id: "q2", kind: "mcq", stem: "Two ____.", options: ["A. x", "B. y"] },
      { id: "q3", kind: "word_form", stem: "Three ____ (HIGH).", options: [] },
    ],
  },
  attempts: [], draft: null, sources: [],
};

describe("the child sees the instruction of the current question's part", () => {
  it("above each question, the line of its own part; it changes when the part changes", () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ draft: { revision: 1, otherTabChanged: false } }) })));
    render(<Player activity={studio} isTest={false} initialResult={null} />);
    expect(screen.getByTestId("question-lead-q1").textContent).toBe("A · Topic vocabulary: Choose the correct word.");
    fireEvent.click(screen.getByTestId("player-next"));
    fireEvent.click(screen.getByTestId("player-next"));
    expect(screen.getByTestId("question-lead-q3").textContent).toBe("B · Word formation: Use the word in capitals.");
  });

  it("an older test (no question numbers in the task) shows no line above the question", () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ draft: { revision: 1, otherTabChanged: false } }) })));
    render(<Player activity={{ ...studio, step: { ...studio.step, promptEn: "A: Choose.\nB: Write." } }} isTest={false} initialResult={null} />);
    expect(screen.queryByTestId("question-lead-q1")).toBeNull();
  });

  it("the task box lists the parts one per line", () => {
    render(<TaskLines prompt={studio.step.promptEn} />);
    expect([...screen.getByTestId("task-lines").querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "Questions 1–2 · A · Topic vocabulary: Choose the correct word.",
      "Question 3 · B · Word formation: Use the word in capitals.",
    ]);
  });
});
