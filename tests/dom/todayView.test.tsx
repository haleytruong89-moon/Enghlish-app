import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { TodayView } from "@/components/student/desk/TodayView";
import { studentDeskCopy } from "@/lib/copy/vi";
import type { Task } from "@/lib/student/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode } & Record<string, unknown>) => createElement("a", { ...p, href: p.href }, p.children) }));

afterEach(cleanup);
const task = (o: Partial<Task>): Task => ({
  kind: "topic", activityId: "a", assignmentId: null, stepNo: 2, activityType: "ACT-SOURCE-QA", title: "Núi lửa", dueOn: "2026-11-20", opensOn: "2026-11-10", timeMin: 10,
  doable: true, practice: false, offLabel: null, hasDraft: false, draftAt: null, filled: null, total: null, mode: null, purpose: [], ...o,
});
const studio = task({ kind: "app", activityId: "u5", activityType: "ACT-SOURCE-QA", title: "Unit 5 luyện tập", practice: true, hasDraft: true, draftAt: "2026-11-14T10:00:00Z", filled: 12, total: 30, timeMin: 25 });
const show = (tasks: Task[], review = null as null | { sessionDate: string; message: string | null; labels: string[] }) =>
  render(<TodayView alias="Nguyên (thử)" color="#2B5D4F" tasks={tasks} practice={[]} review={review} />);

describe("Hôm nay", () => {
  it("'còn n việc · khoảng m phút' with the numbers inside data-count=work; a resumed draft shows the answered count in the same way", () => {
    show([studio, task({ activityId: "b", timeMin: 10 }), task({ activityId: "c", doable: false, offLabel: "with_tutor", timeMin: null })]);
    const lead = screen.getByTestId("today-lead");
    expect(lead.textContent).toBe(`${studentDeskCopy.leadStart}${studentDeskCopy.leadCount(2)}${studentDeskCopy.leadMinutes(35)}`);
    expect(lead.querySelector('[data-count="work"]')?.textContent).toBe("2 việc");
    const card = screen.getByTestId("continue-card");
    expect(card.getAttribute("data-resume")).toBe("yes");
    expect(within(card).getByTestId("continue-eyebrow").textContent).toBe(studentDeskCopy.resume);
    expect(within(card).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("12");
    expect(card.querySelector('[data-count="work"]')?.textContent).toBe("12/30 câu");
    expect(within(card).getByRole("link").getAttribute("href")).toBe("/activities/u5");
  });

  it("no draft → 'Việc tiếp theo' with minutes; no progress bar", () => {
    show([task({ activityId: "b" })]);
    const card = screen.getByTestId("continue-card");
    expect(card.getAttribute("data-resume")).toBe("no");
    expect(within(card).queryByRole("progressbar")).toBeNull();
    expect(card.textContent).toContain(studentDeskCopy.minutes(10));
  });

  it("22/11: the card carries no tutor (no dimmed 'Sắp có' button, no pointer): the tutor is not part of the work", () => {
    show([studio]);
    expect(screen.queryByTestId("ask-tutor")).toBeNull();
    expect(screen.queryByTestId("ask-tutor-hint")).toBeNull();
    expect(screen.queryByText(/Sắp có/)).toBeNull();
  });

  it("buttons are big enough (min-h-12 for the main one, min-h-11 for the others) and an off-app step is listed but not a link", () => {
    show([studio, task({ activityId: "s", doable: false, offLabel: "with_tutor", activityType: "ACT-SPEAK-LIVE", title: "Nói" })]);
    expect(within(screen.getByTestId("continue-card")).getByRole("link").className).toContain("min-h-12");
    const rows = screen.getAllByTestId("task-row");
    const off = rows.find((r) => r.getAttribute("data-doable") === "no")!;
    expect(within(off).queryByRole("link")).toBeNull();
    expect(off.textContent).toContain("Làm cùng thầy/cô");
    expect(within(rows.find((r) => r.getAttribute("data-doable") === "yes")!).getByRole("link").className).toContain("min-h-14");
  });

  it("states are words, not colour alone; no 'quá hạn', no score words, no a/b outside data-count=work (dates are <time>)", () => {
    const { container } = show([studio, task({ activityId: "b", dueOn: "2020-01-01" })], { sessionDate: "2026-11-10", message: "Nhớ đọc kỹ đề nhé", labels: [] });
    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-count="work"], time').forEach((e) => e.remove());
    const text = (clone.textContent ?? "").replace(/(Thứ \S+|Chủ nhật) \d{2}\/\d{2}/, "");
    expect(text).not.toMatch(/(?<![\d/])\d{1,3}\s*\/\s*\d{1,3}(?![\d/])|%|điểm|đúng|sai\b|quá hạn|trễ|muộn|streak|xếp hạng/i);
    expect(screen.getByTestId("tutor-note").textContent).toContain("Nhớ đọc kỹ đề nhé");
  });

  it("nothing to do: the friendly line and an empty list message, no card", () => {
    show([]);
    expect(screen.getByTestId("today-lead").textContent).toBe(studentDeskCopy.allDone);
    expect(screen.queryByTestId("continue-card")).toBeNull();
    expect(screen.getByTestId("no-tasks").textContent).toBe(studentDeskCopy.noTasks);
  });
});
