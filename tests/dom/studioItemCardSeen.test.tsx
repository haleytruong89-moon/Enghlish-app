import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ItemCard } from "@/components/studio/ItemCard";
import type { StudioItem } from "@/lib/studio/schema";
import { CTX_B } from "../unit/fixtures/studio";

afterEach(cleanup);

const item: StudioItem = {
  n: 3, part: "A", kind: "gap", out_of_app: false, stem: "x ____", options: [], passage_ref: null, key: "quantify", accepted: ["quantity"],
  tag_key: "tu-vung-ngu-canh", target_id: null, reading_skill_key: null, explanation_vi: "", needs_review: true, review_reason: "Key sách in sai.",
};
const parts = [{ key: "A", name: "A", instructions: "" }];

describe("ItemCard · Đã xem ✓", () => {
  it("shows the reason and clears the flag in one click; no button on an unflagged item", () => {
    const onChange = vi.fn();
    const { rerender } = render(<ul><ItemCard item={item} parts={parts} passages={[]} context={CTX_B} issues={[]} onChange={onChange} onRemove={() => {}} /></ul>);
    expect(screen.getByText(/Key sách in sai\./)).toBeTruthy();
    fireEvent.click(screen.getByTestId("item-3-seen"));
    expect(onChange).toHaveBeenCalledWith({ needs_review: false, review_reason: null });
    rerender(<ul><ItemCard item={{ ...item, needs_review: false, review_reason: null }} parts={parts} passages={[]} context={CTX_B} issues={[]} onChange={onChange} onRemove={() => {}} /></ul>);
    expect(screen.queryByTestId("item-3-seen")).toBeNull();
  });
});
