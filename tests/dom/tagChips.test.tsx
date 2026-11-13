import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TagChips } from "@/components/tutor/TagChips";
import { tagPicker } from "@/lib/copy/vi";
import type { TagInfo } from "@/lib/tutorwork/types";
import { levelledMap } from "../unit/fixtures/skillMap";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
afterEach(cleanup);

const tag = (key: string): TagInfo => ({ key, label: key, group: null, custom: false });
const TAGS = ["cau-dieu-kien-dao-ngu", "dang-tu", "thanh-ngu", "phat-am", "tu-noi-lap-luan"].map(tag);
const map = levelledMap();

function Harness({ onSubmit = vi.fn() }: { onSubmit?: () => void }) {
  const [sel, setSel] = useState<string[]>([]);
  return (
    <form onSubmit={onSubmit}>
      <TagChips tags={TAGS} map={map} selected={sel} onChange={setSel} max={3} onAdd={async () => ({ error: "x" })} testId="t" />
    </form>
  );
}

describe("TagChips (4a)", () => {
  it("picks three tags in three domains; the counter says 3/3 and every pick stays ticked", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("tag-chip-cau-dieu-kien-dao-ngu"));
    fireEvent.click(screen.getByTestId("tab-t-vocab"));
    fireEvent.click(screen.getByTestId("tag-chip-dang-tu"));
    fireEvent.click(screen.getByTestId("tab-t-speaking"));
    fireEvent.click(screen.getByTestId("tag-chip-phat-am"));
    for (const k of ["cau-dieu-kien-dao-ngu", "dang-tu", "phat-am"]) expect(screen.getByTestId(`tag-chip-${k}`).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(tagPicker.maxReached(3))).toBeTruthy();
    expect(tagPicker.maxReached(3)).toContain("Đã chọn 3/3 (đủ)");
  });

  it("chosen chips stay visible while searching and can be removed with one tap", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("tab-t-vocab"));
    fireEvent.click(screen.getByTestId("tag-chip-dang-tu"));
    fireEvent.change(screen.getByTestId("search-t"), { target: { value: "phat" } });
    const chosen = screen.getByTestId("t-chosen-dang-tu");
    expect(chosen).toBeTruthy();
    fireEvent.click(chosen);
    expect(screen.queryByTestId("t-chosen-dang-tu")).toBeNull();
    expect(screen.getByText(tagPicker.selected(0, 3))).toBeTruthy();
  });

  it("Enter in the search box never submits the form; one hit gets ticked", () => {
    const spy = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(<Harness onSubmit={spy} />);
    const search = screen.getByTestId("search-t");
    fireEvent.change(search, { target: { value: "phat" } });
    const notPrevented = fireEvent.keyDown(search, { key: "Enter" });
    expect(notPrevented).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByTestId("tag-chip-phat-am").getAttribute("aria-checked")).toBe("true");
  });

  it("Enter with several hits does nothing", () => {
    render(<Harness />);
    const search = screen.getByTestId("search-t");
    fireEvent.change(search, { target: { value: "dang" } });
    fireEvent.change(search, { target: { value: "u" } }); // dang-tu, cau-dieu-kien..., thanh-ngu, tu-noi-lap-luan
    expect(fireEvent.keyDown(search, { key: "Enter" })).toBe(false);
    expect(screen.queryByTestId("t-chosen-dang-tu")).toBeNull();
    expect(screen.getByText(tagPicker.selected(0, 3))).toBeTruthy();
  });
});
