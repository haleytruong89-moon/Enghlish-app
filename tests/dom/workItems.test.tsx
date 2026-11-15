import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { WorkItems, type WorkItemRow } from "@/components/review/WorkItems";
import { reviewItemCopy } from "@/lib/copy/vi";

afterEach(cleanup);
const rows: WorkItemRow[] = [
  { id: "q1", n: 1, stem: "one", given: "a", status: "right", blank: false, keyLine: null },
  { id: "q2", n: 2, stem: "two", given: "b", status: "wrong", blank: false, keyLine: "Đáp án: x" },
  { id: "q3", n: 3, stem: "three", given: "", status: "waiting", blank: false, keyLine: null },
  { id: "q4", n: 4, stem: "four", given: "", status: "wrong", blank: true, keyLine: null },
];
const order = () => screen.getAllByTestId(/^item-q\d$/).map((e) => e.getAttribute("data-testid"));

describe("the tutor's item list (green / red / orange)", () => {
  it("wrong and waiting come first, each with its question number, a colour state AND words", () => {
    render(<WorkItems rows={rows} givenLabel="Nguyên trả lời" blankLabel="(để trống)" />);
    expect(order()).toEqual(["item-q2", "item-q4", "item-q3", "item-q1"]);
    expect(screen.getByTestId("item-q1").getAttribute("data-status")).toBe("right");
    expect(screen.getByTestId("item-q2").getAttribute("data-status")).toBe("wrong");
    expect(screen.getByTestId("item-q3").getAttribute("data-status")).toBe("waiting");
    expect(screen.getByTestId("item-chip-q1").textContent).toBe(reviewItemCopy.right);
    expect(screen.getByTestId("item-chip-q2").textContent).toBe(reviewItemCopy.wrong);
    expect(screen.getByTestId("item-chip-q4").textContent).toBe(reviewItemCopy.blank);
    expect(screen.getByTestId("item-chip-q3").textContent).toBe(reviewItemCopy.waiting);
    expect(within(screen.getByTestId("item-q4")).getByText(reviewItemCopy.questionLabel(4))).toBeTruthy();
    expect(screen.getByTestId("item-q2").className).toContain("border-[#B3261E]");
  });
  it("the filter keeps only wrong and waiting items, and is a toggle (aria-pressed)", () => {
    render(<WorkItems rows={rows} givenLabel="g" blankLabel="b" />);
    const only = screen.getByTestId("items-filter-check");
    expect(only.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(only);
    expect(only.getAttribute("aria-pressed")).toBe("true");
    expect(order()).toEqual(["item-q2", "item-q4", "item-q3"]);
    fireEvent.click(screen.getByTestId("items-filter-all"));
    expect(order()).toHaveLength(4);
  });
  it("tap targets are at least 44 px and an all-right list says so under the filter", () => {
    render(<WorkItems rows={[rows[0]!]} givenLabel="g" blankLabel="b" />);
    expect(screen.getByTestId("items-filter-all").className).toContain("min-h-11");
    fireEvent.click(screen.getByTestId("items-filter-check"));
    expect(screen.getByTestId("items-none").textContent).toBe(reviewItemCopy.noneToCheck);
  });
});
