import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AssignForm } from "@/components/practice/AssignForm";
import { blockImplicitSubmit } from "@/lib/forms/enter";
import { tagPicker } from "@/lib/copy/vi";
import type { TagInfo } from "@/lib/tutorwork/types";
import { levelledMap } from "../unit/fixtures/skillMap";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const tag = (key: string): TagInfo => ({ key, label: key, group: null, custom: false });
const TAGS = ["cau-dieu-kien-dao-ngu", "dang-tu", "phat-am"].map(tag);

function mount() {
  return render(<AssignForm learnerId="l1" alias="An" tags={TAGS} frames={[]} today="2026-11-13" map={levelledMap()} />);
}

describe("blockImplicitSubmit", () => {
  const ev = (tagName: string, type: string, key = "Enter") => {
    const preventDefault = vi.fn();
    blockImplicitSubmit({ key, target: { tagName, type }, preventDefault } as never);
    return preventDefault;
  };
  it("blocks Enter in one-line inputs only", () => {
    expect(ev("INPUT", "text")).toHaveBeenCalled();
    expect(ev("INPUT", "search")).toHaveBeenCalled();
    expect(ev("INPUT", "text", "a")).not.toHaveBeenCalled();
    expect(ev("TEXTAREA", "textarea")).not.toHaveBeenCalled();
    expect(ev("BUTTON", "submit")).not.toHaveBeenCalled();
    expect(ev("INPUT", "checkbox")).not.toHaveBeenCalled();
  });
});

describe("AssignForm (4a)", () => {
  it("switching link/PDF keeps the picks", () => {
    mount();
    fireEvent.click(screen.getByTestId("tag-chip-cau-dieu-kien-dao-ngu"));
    fireEvent.click(screen.getByTestId("tab-assign-tags-vocab"));
    fireEvent.click(screen.getByTestId("tag-chip-dang-tu"));
    fireEvent.click(screen.getByTestId("kind-pdf"));
    fireEvent.click(screen.getByTestId("kind-link"));
    expect(screen.getByText(tagPicker.selected(2, 3))).toBeTruthy();
  });

  it("Enter in the title field does not submit", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    mount();
    const title = screen.getByTestId("assign-title");
    fireEvent.change(title, { target: { value: "Bài 1" } });
    fireEvent.change(screen.getByTestId("assign-url"), { target: { value: "https://www.khanacademy.org/x" } });
    expect(fireEvent.keyDown(title, { key: "Enter" })).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("after 'Giao bài khác' the counter is 0/3 and chips are enabled again", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, id: "a1" }), { status: 200, headers: { "content-type": "application/json" } })));
    mount();
    fireEvent.click(screen.getByTestId("tag-chip-cau-dieu-kien-dao-ngu"));
    fireEvent.change(screen.getByTestId("assign-title"), { target: { value: "Bài 1" } });
    fireEvent.change(screen.getByTestId("assign-url"), { target: { value: "https://www.khanacademy.org/x" } });
    fireEvent.click(screen.getByTestId("assign-submit"));
    await waitFor(() => expect(screen.getByTestId("assign-done")).toBeTruthy());
    fireEvent.click(screen.getByTestId("assign-another"));
    expect(screen.getByText(tagPicker.selected(0, 3))).toBeTruthy();
    expect((screen.getByTestId("tag-chip-cau-dieu-kien-dao-ngu") as HTMLButtonElement).disabled).toBe(false);
  });
});
