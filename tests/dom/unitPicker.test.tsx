import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { UnitPicker } from "@/components/curriculum/UnitPicker";
import { unitPickerCopy } from "@/lib/copy/vi";
import { autoTitle, emptyPicker, type UnitChoice } from "@/lib/curriculum/unitPicker";

afterEach(cleanup);

const u = (n: number, points: string[] = []) => ({ kind: "unit" as const, code: `U${n}`, title: `Unit ${n}`, status: n === 3 ? "in_progress" : "not_started", points });
const DEST: UnitChoice = {
  curriculumId: "c1",
  title: "Destination C1 C2",
  units: [u(1), u(2), u(3, ["cau-dieu-kien", "thanh-ngu"]), u(4, ["thanh-ngu", "cum-dong-tu"])],
  reviews: [{ kind: "review", id: "r2", label: "Review 2", progressTest: false, related: ["U3", "U4"] }],
};

function Harness({ choices, compact }: { choices: UnitChoice[]; compact?: boolean }) {
  const [s, set] = useState(emptyPicker);
  return (
    <>
      <UnitPicker learnerId="l1" choices={choices} state={s} onChange={set} compact={compact} tagLabels={{ "cau-dieu-kien": "Câu điều kiện", "thanh-ngu": "Thành ngữ", "cum-dong-tu": "Cụm động từ" }} />
      <output data-testid="title">{autoTitle(choices, s)}</output>
    </>
  );
}

describe("UnitPicker", () => {
  it("ticking Review 2 ticks U3 and U4, fills the title and shows the derived items once each", () => {
    render(<Harness choices={[DEST]} />);
    fireEvent.click(screen.getByTestId("review-c1-r2"));
    expect((screen.getByTestId("unit-c1-U3") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("unit-c1-U4") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId("title").textContent).toBe("Destination C1 C2 · Review 2 (Unit 3–4)");
    expect(screen.getByTestId("unit-picker-derived").textContent).toBe(unitPickerCopy.derived(3, "Câu điều kiện, Thành ngữ, Cụm động từ", 0));
  });
  it("unticking U4 unticks Review 2 and keeps U3", () => {
    render(<Harness choices={[DEST]} />);
    fireEvent.click(screen.getByTestId("review-c1-r2"));
    fireEvent.click(screen.getByTestId("unit-c1-U4"));
    expect((screen.getByTestId("review-c1-r2") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId("unit-c1-U3") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId("title").textContent).toBe("Destination C1 C2 · Unit 3");
  });
  it("shows the state of a Unit, and the compact form has no item line", () => {
    const { rerender } = render(<Harness choices={[DEST]} />);
    expect(screen.getByText(/U3 · Unit 3 · Đang học/)).toBeTruthy();
    rerender(<Harness choices={[DEST]} compact />);
    fireEvent.click(screen.getByTestId("unit-c1-U3"));
    expect(screen.queryByTestId("unit-picker-derived")).toBeNull();
  });
  it("no approved curriculum → a note and a link to Giáo trình", () => {
    render(<Harness choices={[]} />);
    expect(screen.getByText(new RegExp(unitPickerCopy.none))).toBeTruthy();
    expect(screen.getByText(unitPickerCopy.noneLink).closest("a")?.getAttribute("href")).toBe("/learners/l1/curricula");
  });
});
