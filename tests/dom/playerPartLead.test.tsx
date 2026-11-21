import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Player } from "@/components/student/player/Player";
import { TaskLines } from "@/components/student/TaskLines";
import { TaskParts } from "@/components/student/TaskParts";
import type { TaskPart } from "@/lib/studio/taskParts";
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

/** E0: "Bài tập 16/11/2026" (approved before 21/11, so its task text has no question numbers): the box showed every part together. */
describe("E0: with the parts from the database, each question shows its own part only", () => {
  const OLD_PROMPT = "Complete the sentences with a suitable place:: Complete the sentences with a suitable place:\nPlaces: museum, art gallery, library, zoo\nB · Adjectives: Choose the best adjective. Adjectives: noisy · quiet · crowded\nC: Điền dạng đúng của từ trong ngoặc.";
  const PARTS: TaskPart[] = [
    { key: "A", name: "Complete the sentences with a suitable place:", instructions: "Complete the sentences with a suitable place:\nPlaces: museum, art gallery, library, zoo", items: ["q1"] },
    { key: "B", name: "B · Adjectives", instructions: "Choose the best adjective. Adjectives: noisy · quiet · crowded", items: ["q2"] },
    { key: "C", name: "C", instructions: "Điền dạng đúng của từ trong ngoặc.", items: ["q3"] },
  ];
  const old: SupportedActivityView = { ...studio, step: { ...studio.step, promptEn: OLD_PROMPT } };
  const stub = () => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ draft: { revision: 1, otherTabChanged: false } }) })));

  it("question 1: the place instruction once and the Places chips; nothing of parts B or C", () => {
    stub();
    render(<Player activity={old} isTest={false} initialResult={null} parts={PARTS} />);
    const lead = screen.getByTestId("question-lead-q1");
    expect(lead.textContent!.match(/Complete the sentences with a suitable place/g)).toHaveLength(1);
    expect([...lead.querySelectorAll('[data-testid="question-lead-q1-chip"]')].map((c) => c.textContent)).toEqual(["museum, ", "art gallery, ", "library, ", "zoo"]); // ", " is for screen readers only
    expect(lead.textContent).not.toMatch(/Adjectives|noisy|Điền dạng/);
  });

  it("a question of part 2 shows part 2's instruction and chips only (its title is the bank's label: not repeated)", () => {
    stub();
    render(<Player activity={old} isTest={false} initialResult={null} parts={PARTS} />);
    fireEvent.click(screen.getByTestId("player-next"));
    const lead = screen.getByTestId("question-lead-q2");
    expect(lead.textContent).toBe("Choose the best adjective.Adjectives:noisy, quiet, crowded");
    expect(lead.querySelector("ul")?.getAttribute("aria-label")).toBe("Adjectives");
    expect(lead.textContent).not.toMatch(/place|Places|Điền dạng/);
  });

  it("the task box lists each part with its questions, never one run-together paragraph", () => {
    render(<TaskParts parts={PARTS} />);
    expect(screen.getAllByTestId(/^task-part-[A-Z]$/).map((li) => li.querySelector("b")?.textContent)).toEqual(["Question 1", "Question 2", "Question 3"]);
    expect(screen.getByTestId("task-part-A").textContent!.match(/suitable place/g)).toHaveLength(1);
  });
});

