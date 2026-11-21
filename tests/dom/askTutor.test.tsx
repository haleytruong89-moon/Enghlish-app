import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Player } from "@/components/student/player/Player";
import type { TaskPart } from "@/lib/studio/taskParts";
import type { SupportedActivityView } from "@/lib/work/types";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ACT: SupportedActivityView = {
  supported: true, activityId: "act1", instanceId: "i1", stepNo: 1, activityType: "ACT-SOURCE-QA", mode: "PRACTICE", purpose: [], date: "2026-11-21", titleVi: "Unit 4",
  bigQuestionEn: "", bigQuestionVi: "", shape: "answers", canSubmit: true,
  step: { promptEn: "A: Places", timeMin: null, selfCheckVi: [], items: [{ id: "q1", kind: "gap", stem: "Tourists often visit the ____.", options: [] }, { id: "q2", kind: "gap", stem: "Two ____.", options: [] }] },
  attempts: [], draft: null, sources: [],
};
const PARTS: TaskPart[] = [{ key: "A", name: "A", instructions: "Complete. Places: museum, art gallery, zoo", items: ["q1", "q2"] }];

function stubFetch(turns: { text: string; level: number; kind: string }[]) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }) => {
    if (String(url).includes("/hints")) {
      calls.push({ url: String(url), body: JSON.parse(init?.body ?? "{}") });
      const t = turns.shift()!;
      return { ok: true, status: 201, json: async () => ({ ...t, fixed: null, replayed: false }) };
    }
    return { ok: true, status: 200, json: async () => ({ draft: { revision: 1, otherTabChanged: false } }) };
  }));
  return calls;
}

describe("E1 · Hỏi under a Studio practice question", () => {
  it("Hỏi → H1 in the yellow box; Gợi ý tiếp → H2 … H3; then the reminder to answer and no more button; turns stay when moving between questions", async () => {
    const calls = stubFetch([{ text: "Hint one?", level: 1, kind: "hint" }, { text: "Hint two?", level: 2, kind: "hint" }, { text: "Hint three?", level: 3, kind: "hint" }]);
    render(<Player activity={ACT} isTest={false} initialResult={null} parts={PARTS} />);
    expect(screen.queryByTestId("ask-tutor")).toBeNull(); // the dimmed "Sắp có" slot is gone
    fireEvent.click(screen.getByTestId("tutor-ask"));
    await waitFor(() => expect(screen.getAllByTestId("tutor-text").map((x) => x.textContent)).toEqual(["Hint one?"]));
    expect(calls[0]).toMatchObject({ url: "/api/student/activities/act1/hints", body: { item_id: "q1" } });
    expect(calls[0]!.body).not.toHaveProperty("question");
    expect(screen.getByTestId("tutor-ask").textContent).toBe("Gợi ý tiếp");
    fireEvent.click(screen.getByTestId("tutor-ask"));
    await waitFor(() => expect(screen.getAllByTestId("tutor-text")).toHaveLength(2));
    fireEvent.click(screen.getByTestId("tutor-ask"));
    await waitFor(() => expect(screen.getAllByTestId("tutor-text")).toHaveLength(3));
    expect(screen.queryByTestId("tutor-ask")).toBeNull();
    expect(screen.getByTestId("tutor-last").textContent).toMatch(/thử trả lời/);
    fireEvent.click(screen.getByTestId("player-next"));
    expect(screen.queryAllByTestId("tutor-text")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("player-prev"));
    expect(screen.getAllByTestId("tutor-text")).toHaveLength(3);
  });

  it("a short question goes with the request; a test or work without parts has no Hỏi", async () => {
    const calls = stubFetch([{ text: "Cathedral là nhà thờ lớn. Bạn đọc lại câu xem cần nơi nào?", level: 0, kind: "question" }]);
    render(<Player activity={ACT} isTest={false} initialResult={null} parts={PARTS} />);
    fireEvent.click(screen.getByTestId("tutor-open-question"));
    fireEvent.change(screen.getByTestId("tutor-question"), { target: { value: "cathedral nghĩa là gì?" } });
    fireEvent.click(screen.getByTestId("tutor-send"));
    await waitFor(() => expect(screen.getByTestId("tutor-text").getAttribute("lang")).toBe("vi"));
    expect(calls[0]!.body).toMatchObject({ item_id: "q1", question: "cathedral nghĩa là gì?" });
    cleanup();
    render(<Player activity={ACT} isTest initialResult={null} parts={PARTS} />);
    expect(screen.queryByTestId("tutor-ask")).toBeNull();
    cleanup();
    render(<Player activity={ACT} isTest={false} initialResult={null} parts={null} />);
    expect(screen.queryByTestId("tutor-ask")).toBeNull();
    expect(screen.getByTestId("ask-tutor")).toBeTruthy();
  });
});
