import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { UnitTitlePicker } from "@/components/curriculum/UnitTitlePicker";
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
});
