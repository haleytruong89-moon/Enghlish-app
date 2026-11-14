import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MonthSheet } from "@/components/sessions/MonthSheet";
import { sessionMonthCopy } from "@/lib/copy/vi";
import { months, monthText, sessionDays } from "@/lib/sessions/count";
import { parseMonth } from "@/lib/sessions/view";
import type { NoteRow } from "@/lib/sessions/types";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
let n = 0;
const note = (date: string, o: Partial<NoteRow> = {}): NoteRow => ({ id: `n${++n}`, sessionDate: date, supersedesId: null, authorRole: "tutor", published: true, createdAt: date, ...o });
const priv = note("2026-11-10", { published: false });
const rows = [note("2026-11-03"), note("2026-11-05", { authorRole: "parent" }), priv, note("2026-11-12"), note("2026-11-14")];
const taught = [{ noteId: rows[0]!.id, curriculumId: "c1", unitCode: "U13" }, { noteId: priv.id, curriculumId: "c1", unitCode: "U99" }];
const month = months(sessionDays(rows, taught, () => "Unreal time"), "2026-11-14")[0]!;

describe("MonthSheet", () => {
  it("total, table columns, roles, the private day without Units", () => {
    render(<MonthSheet alias="Nguyên" month={month} />);
    expect(screen.getByTestId("month-total").textContent).toBe("4 buổi");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(sessionMonthCopy.title("Nguyên", "11/2026"));
    for (const c of Object.values(sessionMonthCopy.cols)) expect(screen.getByText(c)).toBeTruthy();
    expect(screen.getByTestId("sheet-row-2026-11-03").textContent).toContain("U13 Unreal time");
    expect(screen.getByTestId("sheet-row-2026-11-05").textContent).toContain(sessionMonthCopy.parentOnly);
    const p = screen.getByTestId("sheet-row-2026-11-10").textContent!;
    expect(p).toContain(sessionMonthCopy.privateNote);
    expect(p).not.toContain("U99");
  });
  it("copy writes the Zalo sentence and says 'Đã chép'", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<MonthSheet alias="Nguyên" month={month} />);
    fireEvent.click(screen.getByTestId("month-copy"));
    await waitFor(() => expect(screen.getByTestId("month-copy").textContent).toBe(sessionMonthCopy.copied));
    expect(writeText).toHaveBeenCalledWith(monthText("Nguyên", month));
    expect(monthText("Nguyên", month)).toBe("Nguyên · Tháng 11/2026: 4 buổi — 03/11, 10/11, 12/11, 14/11.");
  });
  it("without a clipboard the text is shown selected to copy by hand", async () => {
    vi.stubGlobal("navigator", {});
    render(<MonthSheet alias="Nguyên" month={month} />);
    fireEvent.click(screen.getByTestId("month-copy"));
    const box = (await screen.findByTestId("month-manual")) as HTMLTextAreaElement;
    expect(box.value).toBe(monthText("Nguyên", month));
  });
  it("print calls window.print; the buttons are hidden when printing", () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    render(<MonthSheet alias="Nguyên" month={month} />);
    fireEvent.click(screen.getByTestId("month-print"));
    expect(print).toHaveBeenCalled();
    expect(screen.getByTestId("month-print").className).toContain("print:hidden");
    expect(screen.getByTestId("month-copy").className).toContain("print:hidden");
  });
  it("an empty month", () => {
    render(<MonthSheet alias="Nguyên" month={{ month: "2026-10", sessions: 0, days: [], billing: { sessions: 0, makeups: 0, absences: { student: 0, tutor: 0, other: 0 }, absenceTotal: 0, billable: 0, dates: [], absenceDates: [], clashDates: [] } }} />);
    expect(screen.getByTestId("month-empty")).toBeTruthy();
  });
});

describe("parseMonth (the page answers 404 for null)", () => {
  it("accepts a real month up to today's, refuses the rest", () => {
    expect(parseMonth("2026-11", "2026-11-14")).toBe("2026-11");
    expect(parseMonth("2026-01", "2026-11-14")).toBe("2026-01");
    // up to 2 months ahead (the +60-day window of absences)
    expect(parseMonth("2026-12", "2026-11-14")).toBe("2026-12");
    expect(parseMonth("2027-01", "2026-11-14")).toBe("2027-01");
    expect(parseMonth("2026-02", "2025-12-31")).toBe("2026-02");
    expect(parseMonth("2026-03", "2025-12-31")).toBeNull();
    for (const bad of ["2026-13", "2026-00", "abc", "2027-02", "2026-1", "2026-11-01"]) expect(parseMonth(bad, "2026-11-14"), bad).toBeNull();
  });
});

describe("MonthSheet 3B", () => {
  const nov = [note("2026-11-03", { id: "r1" }), note("2026-11-10", { id: "r2" }), note("2026-11-12", { id: "mu" })];
  const d = sessionDays(nov, [], () => null, [{ id: "m1", noteId: "mu", kind: "makeup", makeupFor: "a1", reason: null, createdAt: "t" }]);
  const abs = [{ id: "a1", absentOn: "2026-11-05", requestedBy: "tutor" as const, billable: true, cancelsId: null, note: null, createdAt: "t" }];
  const m = months(d, "2026-11-14", abs)[0]!;
  it("shows makeups, absences by who, billable sessions, the absence days and the rule", () => {
    render(<MonthSheet alias="Nguyên" month={m} billing />);
    expect(screen.getByTestId("month-makeups").textContent).toContain("1");
    expect(screen.getByTestId("month-absences").textContent).toContain("0 / 1 / 0");
    expect(screen.getByTestId("month-billable").textContent).toContain("3");
    expect(screen.getByTestId("month-absence-list").textContent).toContain("05/11 · thầy/cô, có tính phí");
    expect(screen.getByTestId("sheet-row-2026-11-12").textContent).toContain("học bù");
  });
  it("the copied text adds the makeups, the absences and the billable count", () => {
    expect(monthText("Nguyên", m)).toBe("Nguyên · Tháng 11/2026: 3 buổi — 03/11, 10/11, 12/11 · học bù 1 · nghỉ 1 (05/11 thầy/cô, tính phí) · tính phí 3 buổi.");
  });
  it("a live absence on a day with a session is flagged in the sheet", () => {
    const clash = months(d, "2026-11-14", [...abs, { ...abs[0]!, id: "a2", absentOn: "2026-11-10" }])[0]!;
    render(<MonthSheet alias="Nguyên" month={clash} billing />);
    expect(screen.getByTestId("sheet-clash-2026-11-10")).toBeTruthy();
    expect(screen.getByTestId("absence-clash-2026-11-10")).toBeTruthy();
    expect(screen.queryByTestId("absence-clash-2026-11-05")).toBeNull();
  });
  it("without billing the sheet has no 3B block", () => {
    render(<MonthSheet alias="Nguyên" month={m} />);
    expect(screen.queryByTestId("month-billing")).toBeNull();
  });
});
