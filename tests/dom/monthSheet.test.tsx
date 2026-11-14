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
    expect(screen.getByTestId("month-total").textContent).toBe("5 buổi");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(sessionMonthCopy.title("Nguyên", "11/2026"));
    for (const c of Object.values(sessionMonthCopy.cols)) expect(screen.getByText(c)).toBeTruthy();
    expect(screen.getByTestId("sheet-row-2026-11-03").textContent).toContain("U13 Unreal time");
    expect(screen.getByTestId("sheet-row-2026-11-05").textContent).toContain("Phụ huynh");
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
    expect(monthText("Nguyên", month)).toBe("Nguyên · Tháng 11/2026: 5 buổi — 03/11, 05/11, 10/11, 12/11, 14/11.");
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
    render(<MonthSheet alias="Nguyên" month={{ month: "2026-10", sessions: 0, days: [] }} />);
    expect(screen.getByTestId("month-empty")).toBeTruthy();
  });
});

describe("parseMonth (the page answers 404 for null)", () => {
  it("accepts a real month up to today's, refuses the rest", () => {
    expect(parseMonth("2026-11", "2026-11-14")).toBe("2026-11");
    expect(parseMonth("2026-01", "2026-11-14")).toBe("2026-01");
    for (const bad of ["2026-13", "2026-00", "abc", "2026-12", "2027-01", "2026-1", "2026-11-01"]) expect(parseMonth(bad, "2026-11-14"), bad).toBeNull();
  });
});
