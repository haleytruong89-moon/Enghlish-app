import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SubmitPanel } from "@/components/practice/SubmitPanel";
import { workWeekCopy } from "@/lib/copy/vi";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const A = "c0000000-0000-4000-8000-000000000002";
const L = "a0000000-0000-4000-8000-000000000001";
const at = (iso: string) => vi.setSystemTime(new Date(iso));
beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("'Tuần làm bài' when an adult sends paper work", () => {
  it("Monday and Tuesday (Vietnam time) offer 'Tuần này' (default) and 'Tuần trước' for a PDF assignment", () => {
    at("2026-11-15T17:00:00Z"); // Monday 00:00 VN
    render(<SubmitPanel learnerId={L} assignmentId={A} kind="pdf" />);
    expect(screen.getByTestId(`submit-${A}-week`).textContent).toContain(workWeekCopy.label);
    expect(screen.getByTestId(`submit-${A}-week-this`).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId(`submit-${A}-week-last`).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByTestId(`submit-${A}-week-last`));
    expect(screen.getByTestId(`submit-${A}-week-last`).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId(`submit-${A}-week-last`).className).toContain("min-h-11");
  });
  it("Tuesday 23:59 VN still offers it; Wednesday 00:00 VN and Sunday do not", () => {
    at("2026-11-17T16:59:00Z");
    const { unmount } = render(<SubmitPanel learnerId={L} assignmentId={A} kind="pdf" />);
    expect(screen.queryByTestId(`submit-${A}-week`)).not.toBeNull();
    unmount();
    at("2026-11-17T17:00:00Z");
    const w = render(<SubmitPanel learnerId={L} assignmentId={A} kind="pdf" />);
    expect(screen.queryByTestId(`submit-${A}-week`)).toBeNull();
    w.unmount();
    at("2026-11-15T16:59:00Z");
    render(<SubmitPanel learnerId={L} assignmentId={A} kind="pdf" />);
    expect(screen.queryByTestId(`submit-${A}-week`)).toBeNull();
  });
  it("a link assignment never offers it (a link sent by an adult does not count)", () => {
    at("2026-11-16T05:00:00Z");
    render(<SubmitPanel learnerId={L} assignmentId={A} kind="link" />);
    expect(screen.queryByTestId(`submit-${A}-week`)).toBeNull();
  });
});
