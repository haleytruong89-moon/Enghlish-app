import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Tour } from "@/components/tour/Tour";
import { StartChecklist } from "@/components/tour/StartChecklist";
import { tourCopy } from "@/lib/copy/vi";
import { TOUR_SEEN_KEY } from "@/lib/tour/steps";
import type { StartItem } from "@/lib/tour/checklist";

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("27/11 · Hướng dẫn (tour)", () => {
  it("opens with the button, steps forward and back, and 'Xong' on the last step remembers it on this device", () => {
    render(<Tour alias="An" autoStart={false} />);
    expect(screen.queryByTestId("tour")).toBeNull();
    fireEvent.click(screen.getByTestId("tour-open"));
    expect(screen.getByTestId("tour-step-welcome")).toBeTruthy();
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
    fireEvent.click(screen.getByTestId("tour-next"));
    expect(screen.getByTestId("tour-step-grade").textContent).toContain(tourCopy.steps.grade.title);
    fireEvent.click(screen.getByTestId("tour-prev"));
    expect(screen.getByTestId("tour-step-welcome")).toBeTruthy();
    for (let i = 0; i < 9; i += 1) fireEvent.click(screen.getByTestId("tour-next"));
    expect(screen.getByTestId("tour-step-start")).toBeTruthy();
    fireEvent.click(screen.getByTestId("tour-done"));
    expect(screen.queryByTestId("tour")).toBeNull();
    expect(window.localStorage.getItem(TOUR_SEEN_KEY)).toBe("1");
  });
  it("with real places on screen (non-zero boxes) it highlights them and settles (no endless re-render)", () => {
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 10, left: 20, width: 200, height: 44, right: 220, bottom: 54, x: 20, y: 10, toJSON: () => ({}) } as DOMRect);
    try {
      render(<><header data-testid="staff-topbar">bar</header><a data-testid="quick-grade">Chấm bài</a><Tour alias="An" autoStart={false} /></>);
      fireEvent.click(screen.getByTestId("tour-open"));
      expect(screen.getByTestId("tour-highlight").getAttribute("style")).toContain("#f2b705");
      fireEvent.click(screen.getByTestId("tour-next"));
      expect(screen.getByTestId("tour-step-grade")).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });
  it("Escape and 'Bỏ qua' close it and remember it", () => {
    render(<Tour alias="An" autoStart={false} />);
    fireEvent.click(screen.getByTestId("tour-open"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("tour")).toBeNull();
    fireEvent.click(screen.getByTestId("tour-open"));
    fireEvent.click(screen.getByTestId("tour-skip"));
    expect(window.localStorage.getItem(TOUR_SEEN_KEY)).toBe("1");
  });
  it("a tutor on a new device: opens by itself once; seen before: does not", () => {
    vi.useFakeTimers();
    render(<Tour alias="An" autoStart />);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByTestId("tour-step-welcome")).toBeTruthy();
    cleanup();
    window.localStorage.setItem(TOUR_SEEN_KEY, "1");
    render(<Tour alias="An" autoStart />);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByTestId("tour")).toBeNull();
  });
  it("never opens by itself for the parent (autoStart false) or under automation", () => {
    vi.useFakeTimers();
    render(<Tour alias="An" autoStart={false} />);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByTestId("tour")).toBeNull();
    cleanup();
    Object.defineProperty(window.navigator, "webdriver", { configurable: true, get: () => true });
    try {
      render(<Tour alias="An" autoStart />);
      act(() => vi.advanceTimersByTime(500));
      expect(screen.queryByTestId("tour")).toBeNull();
    } finally {
      delete (window.navigator as { webdriver?: boolean }).webdriver;
    }
  });
});

describe("27/11 · Bắt đầu với …", () => {
  const items: StartItem[] = [
    { key: "levels", done: true, href: "/a" }, { key: "curriculum", done: false, href: "/b" }, { key: "unit", done: null, href: "/c" },
    { key: "assign", done: false, href: "/d" }, { key: "feedback", done: false, href: "/e" }, { key: "session", done: false, href: "/f" },
  ];
  it("done items are ticked without a button; to-do items have 'Làm ngay →'; unknown says so; the count is of done ones", () => {
    render(<StartChecklist learnerId="l1" alias="An" items={items} />);
    expect(screen.getByTestId("start-progress").textContent).toBe(tourCopy.start.progress(1, 6));
    expect(screen.queryByTestId("start-do-levels")).toBeNull();
    expect(screen.getByTestId("start-do-curriculum").getAttribute("href")).toBe("/b");
    expect(screen.getByTestId("start-unit").textContent).toContain(tourCopy.start.unknown);
    expect(screen.queryByTestId("start-do-unit")).toBeNull();
  });
  it("the parent sees it read-only: no 'Làm ngay →' (the items are the tutor's)", () => {
    render(<StartChecklist learnerId="l1" alias="An" items={items} canAct={false} />);
    expect(screen.queryByTestId("start-do-curriculum")).toBeNull();
    expect(screen.getByTestId("start-checklist").textContent).toContain(tourCopy.start.hintParent);
  });
  it("'Ẩn thẻ này' hides it on this device, per child; the small link shows it again", () => {
    render(<StartChecklist learnerId="l1" alias="An" items={items} />);
    fireEvent.click(screen.getByTestId("start-hide"));
    expect(screen.queryByTestId("start-checklist")).toBeNull();
    fireEvent.click(screen.getByTestId("start-show"));
    expect(screen.getByTestId("start-checklist")).toBeTruthy();
  });
});
