import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StudioPendingCard } from "@/components/review/StudioPendingCard";
import { reviewItemCopy } from "@/lib/copy/vi";
import type { PendingAttempt } from "@/lib/studio/types";

afterEach(cleanup);
const attempt: PendingAttempt = {
  attemptId: "a1", learnerId: "L", alias: "Nguyên (thử)", isTest: true, activityId: "act", title: "Unit 5", submittedAt: "2026-11-15T03:00:00Z", attemptNo: 1, waitingDays: 0,
  items: [{ itemId: "q7", n: 7, kind: "short", stem: "Wish", expected: "I wish I could", accepted: [], given: "I wish I can" }],
};

describe("Đúng / Sai on a waiting item: orange, then green or red, with words", () => {
  it("starts orange 'Chờ thầy/cô xem', turns green with Đúng and red with Sai", () => {
    render(<StudioPendingCard attempt={attempt} />);
    const li = screen.getByTestId("studio-item-a1-q7");
    const chip = screen.getByTestId("studio-chip-a1-q7");
    expect(li.getAttribute("data-status")).toBe("waiting");
    expect(chip.textContent).toBe(reviewItemCopy.waiting);
    fireEvent.click(screen.getByTestId("verdict-a1-q7-correct"));
    expect([li.getAttribute("data-status"), chip.textContent]).toEqual(["right", reviewItemCopy.right]);
    fireEvent.click(screen.getByTestId("verdict-a1-q7-incorrect"));
    expect([li.getAttribute("data-status"), chip.textContent]).toEqual(["wrong", reviewItemCopy.wrong]);
  });
});
