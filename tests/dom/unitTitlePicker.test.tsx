import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { UnitTitlePicker } from "@/components/curriculum/UnitTitlePicker";
import { unitPickerCopy } from "@/lib/copy/vi";
import type { UnitChoice } from "@/lib/curriculum/unitPicker";

afterEach(cleanup);
const u = (n: number) => ({ kind: "unit" as const, code: `U${n}`, title: `Unit ${n}`, status: "not_started", points: ["p"] });
const CH: UnitChoice[] = [{ curriculumId: "c1", title: "Destination C1 C2", units: [u(1), u(2), u(3)], reviews: [] }];

function Host({ choices = CH, codes = [] as string[] }) {
  const [title, setTitle] = useState("");
  const [touched, setTouched] = useState(false);
  return (
    <>
      <input data-testid="t" value={title} onChange={(e) => { setTitle(e.target.value); setTouched(true); }} />
      <UnitTitlePicker learnerId="l1" choices={choices} initialCodes={codes} maxLength={20} onTitle={(x) => { if (!touched) setTitle(x); }} />
    </>
  );
}

describe("UnitTitlePicker (Studio / Nạp bài: fills the name only)", () => {
  it("is folded, fills the (clipped) name, never shows the derived items, and stops once the name is typed", () => {
    render(<Host />);
    expect((screen.getByTestId("unit-title-picker") as HTMLDetailsElement).open).toBe(false);
    fireEvent.click(screen.getByTestId("unit-c1-U2"));
    expect((screen.getByTestId("t") as HTMLInputElement).value).toBe("Destination C1 C2 · ");
    expect(screen.queryByTestId("unit-picker-derived")).toBeNull();
    fireEvent.change(screen.getByTestId("t"), { target: { value: "Của tôi" } });
    fireEvent.click(screen.getByTestId("unit-c1-U3"));
    expect((screen.getByTestId("t") as HTMLInputElement).value).toBe("Của tôi");
  });
  it("renders nothing without an approved curriculum", () => {
    render(<Host choices={[]} />);
    expect(screen.queryByTestId("unit-title-picker")).toBeNull();
  });
  it("Units named by the book link are ticked", () => {
    render(<Host codes={["U1", "U3"]} />);
    expect((screen.getByTestId("unit-c1-U3") as HTMLInputElement).checked).toBe(true);
  });
  it("collapses once only: one <details> in total, no nested one", () => {
    render(<Host />);
    const outer = screen.getByTestId("unit-title-picker");
    expect(outer.querySelectorAll("details").length).toBe(0);
    expect(document.querySelectorAll("details").length).toBe(1);
  });
  it("unticking every Unit clears the auto-filled name", () => {
    render(<Host />);
    fireEvent.click(screen.getByTestId("unit-c1-U2"));
    fireEvent.click(screen.getByTestId("unit-c1-U2"));
    expect((screen.getByTestId("t") as HTMLInputElement).value).toBe("");
  });
  it("a Review row with no related Units shows a small hint", () => {
    const ch: UnitChoice[] = [{ ...CH[0]!, reviews: [{ kind: "review", id: "r0", label: "Review 0", progressTest: false, related: [] }] }];
    render(<Host choices={ch} />);
    expect(screen.getByTestId("review-c1-r0").closest("label")?.textContent).toContain(unitPickerCopy.reviewNoUnits);
  });
});
