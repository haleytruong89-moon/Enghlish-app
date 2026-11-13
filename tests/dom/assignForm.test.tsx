import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AssignForm } from "@/components/practice/AssignForm";
import { blockImplicitSubmit } from "@/lib/forms/enter";
import { tagPicker, unitPickerCopy } from "@/lib/copy/vi";
import type { UnitChoice } from "@/lib/curriculum/unitPicker";
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

describe("AssignForm · Giao theo Unit (4b)", () => {
  const u = (n: number, points: string[] = []) => ({ kind: "unit" as const, code: `U${n}`, title: `Unit ${n}`, status: "not_started", points });
  const CHOICES: UnitChoice[] = [{
    curriculumId: "c1", title: "Destination C1 C2", units: [u(1, ["dang-tu"]), u(2), u(3, ["phat-am", "dang-tu"]), u(4)],
    reviews: [{ kind: "review", id: "r2", label: "Review 2", progressTest: false, related: ["U3", "U4"] }],
  }];
  const mountUnits = (prefill?: { title: string | null; pages: string | null; units: string[] }) =>
    render(<AssignForm learnerId="l1" alias="An" tags={TAGS} frames={[]} today="2026-11-13" map={levelledMap()} unitChoices={CHOICES} prefill={prefill} />);
  const okFetch = () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ id: "a1", replayed: false }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", f);
    return f;
  };
  const sentBody = (f: ReturnType<typeof okFetch>) => JSON.parse(f.mock.calls[0]![1]!.body as string) as Record<string, unknown>;

  it("without an approved curriculum the form keeps its old shape (no Unit block, no folded items)", () => {
    mount();
    expect(screen.queryByTestId("assign-by-unit")).toBeNull();
    expect(screen.queryByTestId("assign-extra-items")).toBeNull();
  });

  it("the Unit block comes first and the manual items are folded (closed) under '+ Thêm mục kiến thức khác'", () => {
    mountUnits();
    const unitBlock = screen.getByTestId("assign-by-unit");
    const extra = screen.getByTestId("assign-extra-items") as HTMLDetailsElement;
    expect(extra.open).toBe(false);
    expect(extra.textContent).toContain(unitPickerCopy.moreItems);
    expect(extra.contains(screen.getByTestId("assign-tags"))).toBe(true);
    expect(unitBlock.compareDocumentPosition(extra) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("ticking U3–U4 fills the name; a hand-edited name is no longer overwritten; the body carries the units", async () => {
    const f = okFetch();
    mountUnits();
    fireEvent.click(screen.getByTestId("unit-c1-U3"));
    fireEvent.click(screen.getByTestId("unit-c1-U4"));
    const title = screen.getByTestId("assign-title") as HTMLInputElement;
    expect(title.value).toBe("Destination C1 C2 · Unit 3–4");
    fireEvent.change(title, { target: { value: "Bài ôn của tôi" } });
    fireEvent.click(screen.getByTestId("unit-c1-U1"));
    expect(title.value).toBe("Bài ôn của tôi");
    fireEvent.change(screen.getByTestId("assign-url"), { target: { value: "https://www.khanacademy.org/x" } });
    fireEvent.click(screen.getByTestId("assign-submit"));
    await waitFor(() => expect(screen.getByTestId("assign-done")).toBeTruthy());
    expect(sentBody(f)).toMatchObject({
      title: "Bài ôn của tôi", tags: [],
      units: [{ curriculum_id: "c1", unit_code: "U1" }, { curriculum_id: "c1", unit_code: "U3" }, { curriculum_id: "c1", unit_code: "U4" }],
    });
  });

  it("manual items and units are sent side by side; the 3-item cap is for manual items only", async () => {
    const f = okFetch();
    mountUnits();
    for (const code of ["U1", "U2", "U3", "U4"]) fireEvent.click(screen.getByTestId(`unit-c1-${code}`));
    for (const k of ["cau-dieu-kien-dao-ngu"]) fireEvent.click(screen.getByTestId(`tag-chip-${k}`));
    fireEvent.change(screen.getByTestId("assign-url"), { target: { value: "https://www.khanacademy.org/x" } });
    fireEvent.click(screen.getByTestId("assign-submit"));
    await waitFor(() => expect(screen.getByTestId("assign-done")).toBeTruthy());
    const b = sentBody(f);
    expect(b.tags).toEqual(["cau-dieu-kien-dao-ngu"]);
    expect((b.units as unknown[]).length).toBe(4);
  });

  it("the Units named by 'Giao bài này →' (prefill) are ticked and the given name is kept", () => {
    mountUnits({ title: "Destination C1 C2 · Review 2 (Unit 3–4)", pages: "30–38", units: ["U3", "U4"] });
    expect((screen.getByTestId("unit-c1-U3") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("unit-c1-U4") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("assign-title") as HTMLInputElement).value).toBe("Destination C1 C2 · Review 2 (Unit 3–4)");
  });
});
