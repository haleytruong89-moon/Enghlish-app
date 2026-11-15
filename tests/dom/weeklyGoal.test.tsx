import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { WeekMini } from "@/components/student/goal/WeekMini";
import { WeekCard } from "@/components/student/goal/WeekCard";
import { GoalChip } from "@/components/student/goal/GoalChip";
import { AchievementsCard } from "@/components/student/goal/AchievementsCard";
import { GoalPicker } from "@/components/student/goal/GoalPicker";
import { GoalBox } from "@/components/desk/GoalBox";
import type { WeekView } from "@/lib/student/weekView";
import type { AchievementItem } from "@/lib/student/achievements";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode } & Record<string, unknown>) => createElement("a", { ...p, href: p.href }, p.children) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); refresh.mockReset(); });

const view = (o: Partial<WeekView> = {}): WeekView => ({
  today: "2026-11-12", week: "2026-11-09", rangeLabel: "09/11 – 15/11", goal: 4, count: 2, met: false, remaining: 2, streak: 3,
  pending: null, upcoming: null, range: { min: 3, max: 6 }, suggestion: null, nextMonday: "2026-11-16", ...o,
});
/** Text outside every data-count element: the child may not see "a/b" there. */
const outside = (el: Element): string => {
  const c = el.cloneNode(true) as Element;
  c.querySelectorAll('[data-count="work"], time').forEach((n) => n.remove());
  return c.textContent ?? "";
};

describe("child: week mini / card / chip", () => {
  it("the count a/b sits only inside data-count=work; the dots carry an aria-label", () => {
    const { container } = render(<><WeekMini view={view()} /><WeekCard view={view()} /></>);
    expect(container.querySelector('[data-count="work"]')?.textContent).toMatch(/2/);
    expect(outside(container)).not.toMatch(/\d\s*\/\s*\d/);
    expect(outside(container)).not.toMatch(/xếp hạng|điểm|%|streak/i);
    for (const img of container.querySelectorAll('[role="img"]')) expect(img.getAttribute("aria-label")).toBeTruthy();
  });
  it("no goal: an invitation with a link at least 44px high; a waiting proposal shows no invitation", () => {
    const { rerender } = render(<WeekMini view={view({ goal: null, count: 0, met: false, remaining: 0 })} />);
    expect(screen.getByTestId("week-set-goal").getAttribute("href")).toBe("/goal");
    expect(screen.getByTestId("week-set-goal").className).toContain("min-h-11");
    rerender(<WeekMini view={view({ goal: null, pending: { id: "g", pieces: 4 } })} />);
    expect(screen.queryByTestId("week-set-goal")).toBeNull();
    expect(screen.getByTestId("week-pending")).toBeTruthy();
  });
  it("the card says a new goal starts next week, with the date in <time>", () => {
    render(<WeekCard view={view({ upcoming: { pieces: 5, from: "2026-11-16" } })} />);
    const tag = screen.getByTestId("week-upcoming");
    expect(tag.querySelector("time")?.getAttribute("datetime")).toBe("2026-11-16");
  });
  it("the chip: nothing without a streak; with one it has text and an aria-label and is a 44px target", () => {
    const { container, rerender } = render(<GoalChip streak={0} />);
    expect(container.textContent).toBe("");
    rerender(<GoalChip streak={5} />);
    const chip = screen.getByTestId("streak-chip");
    expect(chip.textContent).toContain("5");
    expect(chip.getAttribute("aria-label")).toBeTruthy();
    expect(chip.className).toContain("min-h-11");
    expect(outside(chip)).toBe("");
  });
});

const item = (o: Partial<AchievementItem>): AchievementItem => ({ key: "k", kind: "first_work", n: null, title: null, earned: true, date: "2026-11-03", have: 1, need: 1, ...o });

describe("child: achievements", () => {
  it("earned items show a date in <time>; the others say what is missing; no other child's name, no score words", () => {
    const { container } = render(<AchievementsCard shown={{ earned: [item({})], nearly: [item({ key: "u", kind: "units", n: 4, earned: false, date: null, have: 3, need: 4 })] }} />);
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe("2026-11-03");
    expect(screen.getByTestId("achievement-u").getAttribute("data-earned")).toBe("no");
    expect(container.textContent).not.toMatch(/xếp hạng|điểm|%|Nguyên|An \(/);
  });
  it("empty: one short line", () => {
    render(<AchievementsCard shown={{ earned: [], nearly: [] }} />);
    expect(screen.getByTestId("achievements-card").querySelectorAll("li").length).toBe(0);
  });
});

describe("child: goal picker", () => {
  const props = { options: [3, 4, 5, 6], current: null, initial: 4, pending: null, upcomingPieces: null, suggestion: null };
  it("a radiogroup of the range; choosing then sending posts the number with a client_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalPicker {...props} />);
    expect(screen.getByRole("radiogroup")).toBeTruthy();
    expect(screen.getAllByRole("radio").length).toBe(4);
    for (const r of screen.getAllByRole("radio")) expect(r.className).toContain("min-h-");
    fireEvent.click(screen.getByTestId("goal-option-5"));
    expect(screen.getByTestId("goal-option-5").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByTestId("goal-send"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [path, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(path).toBe("/api/student/goal");
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.pieces).toBe(5);
    expect(typeof body.client_id).toBe("string");
    expect("applies_from" in body).toBe(false);
  });
  it("a waiting proposal offers only to take it back", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalPicker {...props} pending={{ id: "g1", pieces: 5 }} />);
    expect(screen.queryByTestId("goal-send")).toBeNull();
    fireEvent.click(screen.getByTestId("goal-withdraw"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe("/api/student/goal/withdraw");
  });
});

describe("adult: goal box", () => {
  const box = { goal: 4, count: 2, streak: 3, upcoming: null, pending: { id: "g1", pieces: 5 }, nextMonday: "2026-11-16" };
  it("the parent only reads: no buttons, a waiting note", () => {
    render(<GoalBox learnerId="L" alias="Nguyên (thử)" canDecide={false} view={box} />);
    expect(screen.queryByTestId("goal-accept")).toBeNull();
    expect(screen.queryByTestId("goal-adjust")).toBeNull();
    expect(screen.getByTestId("goal-box-parent-note")).toBeTruthy();
  });
  it("the tutor accepts: the button names the number; the body carries no applies_from", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalBox learnerId="L" alias="Nguyên (thử)" canDecide view={box} />);
    expect(screen.getByTestId("goal-accept").textContent).toContain("5");
    fireEvent.click(screen.getByTestId("goal-accept"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [path, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(path).toBe("/api/learners/L/goals/g1");
    expect(JSON.parse(init.body)).toMatchObject({ action: "accept" });
    expect(init.body).not.toContain("applies_from");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
  it("adjusting needs a different whole number in range; an out-of-range one is refused before any request", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalBox learnerId="L" alias="Nguyên (thử)" canDecide view={box} />);
    fireEvent.click(screen.getByTestId("goal-adjust"));
    fireEvent.change(screen.getByTestId("goal-adjust-input"), { target: { value: "99" } });
    fireEvent.click(screen.getByTestId("goal-adjust-save"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("goal-box-problem")).toBeTruthy();
  });
});
