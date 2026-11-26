import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SessionNoteForm } from "@/components/tutor/SessionNoteForm";
import { sessionKindCopy, sessionNotePage } from "@/lib/copy/vi";
import { presetTaught, type TaughtChoice } from "@/lib/curriculum/shape";
import { levelledMap } from "../unit/fixtures/skillMap";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const choice = (id: string, current: string | null, status: string): TaughtChoice => ({
  curriculumId: id, title: `Sách ${id}`, currentCode: current,
  units: [{ code: "U14", title: "Fourteen", status: "done" }, { code: "U15", title: "Fifteen", status }, { code: "U16", title: "Sixteen", status: "not_started" }],
  statusOf: {},
});
const mount = (o: { choices?: TaughtChoice[]; makeup?: { id: string; label: string }[]; due?: Parameters<typeof SessionNoteForm>[0]["due"] } = {}) =>
  render(<SessionNoteForm learnerId="l1" tags={[]} skills={[]} due={o.due ?? []} previous={null} today="2026-11-26" minDate="2026-07-26" map={levelledMap()} taughtChoices={o.choices ?? []} makeupChoices={o.makeup ?? []} />);

describe("Q5 · presetTaught", () => {
  it("ticks the current unit of a book only when it is 'Đang học'", () => {
    expect(presetTaught([choice("c1", "U15", "in_progress"), choice("c2", "U15", "not_started"), choice("c3", null, "in_progress")], 6)).toEqual([{ curriculum_id: "c1", unit_code: "U15" }]);
  });
  it("a unit the app set 'Đang học' from the child's work is never pre-ticked (a tick is 'taught' evidence)", () => {
    expect(presetTaught([{ ...choice("c1", "U15", "in_progress"), autoOf: { U15: "2026-11-24T00:00:00Z" } }], 6)).toEqual([]);
  });
  it("never more than the limit", () => {
    expect(presetTaught([choice("a", "U15", "in_progress"), choice("b", "U15", "in_progress")], 1)).toHaveLength(1);
  });
});

describe("Q5 · Ghi buổi còn 3 ô", () => {
  it("date, Unit đã dạy (Đang học ticked) and the message are open; everything else is in one closed fold", () => {
    mount({ choices: [choice("c1", "U15", "in_progress")] });
    const fold = screen.getByTestId("session-more") as HTMLDetailsElement;
    expect(fold.open).toBe(false);
    for (const id of ["session-date", "session-message", "taught-c1-U15"]) expect(fold.contains(screen.getByTestId(id)), id).toBe(false);
    for (const id of ["session-kind", "session-studied", "session-practised", "session-parent-note"]) expect(fold.contains(screen.getByTestId(id)), id).toBe(true);
    expect(screen.getByTestId("taught-c1-U15").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("taught-c1-U16").getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("taught-preset").textContent).toBe(sessionNotePage.taughtPreset);
  });
  it("the fold's summary says what is inside, and follows the picks", () => {
    mount();
    expect(screen.getByTestId("session-more-line").textContent).toBe(sessionNotePage.moreLine(sessionKindCopy.regularSession, 0, 0, false));
    fireEvent.change(screen.getByTestId("session-parent-note"), { target: { value: "Em hiểu bài" } });
    expect(screen.getByTestId("session-more-line").textContent).toContain("có ghi chú cho phụ huynh");
  });
  it("no unit is 'Đang học': nothing ticked, no preset line", () => {
    mount({ choices: [choice("c1", "U15", "not_started")] });
    expect(screen.getByTestId("taught-c1-U15").getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByTestId("taught-preset")).toBeNull();
  });
  it("a live absence without a makeup: one line outside the fold; its button marks Học bù and opens the fold", () => {
    mount({ makeup: [{ id: "a1", label: "20/11 · con, có tính phí" }] });
    const hint = screen.getByTestId("session-makeup-hint");
    expect(hint.textContent).toContain(sessionNotePage.makeupHint(1));
    fireEvent.click(within(hint).getByTestId("session-makeup-hint-button"));
    expect((screen.getByTestId("session-more") as HTMLDetailsElement).open).toBe(true);
    expect(screen.getByTestId("session-kind-makeup").getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByTestId("session-makeup-hint")).toBeNull();
  });
  it("one absence waiting: the hint links the note to it (else the month bills both) and says nothing is unlinked", () => {
    mount({ makeup: [{ id: "a1", label: "20/11 · con, có tính phí" }] });
    fireEvent.click(screen.getByTestId("session-makeup-hint-button"));
    expect((screen.getByTestId("session-makeup-for") as HTMLSelectElement).value).toBe("a1");
    expect(screen.getByTestId("session-more-line").textContent).not.toContain(sessionNotePage.makeupUnlinked);
  });
  it("several absences: Học bù without a pick says so on the fold line; 'Không phải' hides the hint", () => {
    mount({ makeup: [{ id: "a1", label: "20/11" }, { id: "a2", label: "21/11" }] });
    fireEvent.click(screen.getByTestId("session-makeup-hint-button"));
    expect((screen.getByTestId("session-makeup-for") as HTMLSelectElement).value).toBe("");
    expect(screen.getByTestId("session-more-line").textContent).toContain(sessionNotePage.makeupUnlinked);
    cleanup();
    mount({ makeup: [{ id: "a1", label: "20/11" }] });
    fireEvent.click(screen.getByTestId("session-makeup-hint-no"));
    expect(screen.queryByTestId("session-makeup-hint")).toBeNull();
    expect(screen.getByTestId("session-kind-regular").getAttribute("aria-checked")).toBe("true");
  });
  it("a backdated session drops the pre-tick (today's unit was not taught last week); back to today brings it back", () => {
    mount({ choices: [choice("c1", "U15", "in_progress")] });
    fireEvent.change(screen.getByTestId("session-date"), { target: { value: "2026-11-19" } });
    expect(screen.getByTestId("taught-c1-U15").getAttribute("aria-checked")).toBe("false");
    fireEvent.change(screen.getByTestId("session-date"), { target: { value: "2026-11-26" } });
    expect(screen.getByTestId("taught-c1-U15").getAttribute("aria-checked")).toBe("true");
  });
  it("once the tutor picks units, the date no longer changes them", () => {
    mount({ choices: [choice("c1", "U15", "in_progress")] });
    fireEvent.click(screen.getByTestId("taught-c1-U16"));
    fireEvent.change(screen.getByTestId("session-date"), { target: { value: "2026-11-19" } });
    expect(screen.getByTestId("taught-c1-U15").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("taught-c1-U16").getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByTestId("taught-preset")).toBeNull();
  });
  it("nothing filled: the error opens the fold", () => {
    mount();
    fireEvent.click(screen.getByTestId("session-save"));
    expect(screen.getByTestId("session-error").textContent).toBe(sessionNotePage.empty);
    expect((screen.getByTestId("session-more") as HTMLDetailsElement).open).toBe(true);
  });
  it("no absence waiting: no hint", () => {
    mount();
    expect(screen.queryByTestId("session-makeup-hint")).toBeNull();
  });
  it("saving with only the preset unit sends it (a valid session)", async () => {
    const f = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ id: "n1" }) }));
    vi.stubGlobal("fetch", f);
    mount({ choices: [choice("c1", "U15", "in_progress")] });
    fireEvent.click(screen.getByTestId("session-save"));
    await waitFor(() => expect(f).toHaveBeenCalled());
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.taught_units).toEqual([{ curriculum_id: "c1", unit_code: "U15" }]);
  });
  it("the re-check panel is folded, its summary counts what is due", () => {
    mount();
    const panel = screen.getByTestId("recheck-panel") as HTMLDetailsElement;
    expect(panel.tagName).toBe("DETAILS");
    expect(panel.open).toBe(false);
    expect(screen.getByTestId("recheck-summary").textContent).toContain(sessionNotePage.recheckCount(0));
  });
  it("re-checks due: the panel opens by itself", () => {
    mount({ due: [{ tagKey: "dang-tu", label: "Dạng từ", recheckDue: true } as Parameters<typeof SessionNoteForm>[0]["due"][number]] });
    expect((screen.getByTestId("recheck-panel") as HTMLDetailsElement).open).toBe(true);
    expect(screen.getByTestId("recheck-summary").textContent).toContain(sessionNotePage.recheckCount(1));
  });
});
