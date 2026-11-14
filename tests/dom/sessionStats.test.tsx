import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SessionStats } from "@/components/sessions/SessionStats";
import { sessionStatsCopy } from "@/lib/copy/vi";
import { sessionDays } from "@/lib/sessions/count";
import type { NoteRow, TaughtRow } from "@/lib/sessions/types";

vi.mock("next/link", () => ({ default: (p: Record<string, unknown> & { href: string; children: React.ReactNode }) => <a href={p.href} data-testid={p["data-testid"] as string}>{p.children}</a> }));
afterEach(cleanup);

const L = "a0000000-0000-4000-8000-000000000001";
const TODAY = "2026-11-14";
let n = 0;
const note = (date: string, o: Partial<NoteRow> = {}): NoteRow => ({ id: o.id ?? `n${++n}`, sessionDate: date, supersedesId: null, authorRole: "tutor", published: true, createdAt: date, ...o });
const taught: TaughtRow[] = [{ noteId: "u1", curriculumId: "c1", unitCode: "U13" }];
const rows = [note("2026-09-14"), note("2026-09-24"), note("2026-10-05"), note("2026-10-08"), note("2026-10-12"), note("2026-10-15"), note("2026-10-19"), note("2026-10-22"), note("2026-10-26"), note("2026-10-29"), note("2026-11-03"), note("2026-11-05", { id: "x" }), note("2026-11-05", { authorRole: "parent" }), note("2026-11-12", { id: "u1" })];
const days = sessionDays(rows, taught, () => "Unreal time");
const cards = [
  { id: "c1", title: "Destination", current: { units: [] }, progress: { current: { code: "U13", title: "Unreal time" } } },
  { id: "c2", title: "Grammar A", current: { units: [] }, progress: { current: { code: "U2", title: "Tenses" } } },
  { id: "c3", title: "Reading", current: { units: [] }, progress: { current: { code: "U1", title: "Intro" } } },
];

describe("SessionStats", () => {
  it("four cards: total, this month, average per week (comma, hint) and where the child is up to (2 + '+1')", () => {
    render(<SessionStats learnerId={L} days={days} today={TODAY} cards={cards} />);
    expect(within(screen.getByTestId("stat-total")).getByText("13")).toBeTruthy();
    expect(within(screen.getByTestId("stat-month")).getByText("3")).toBeTruthy(); // 03/11, 05/11 (2 notes), 12/11
    expect(screen.getByTestId("stat-per-week").textContent).toContain(sessionStatsCopy.perWeekHint);
    expect(screen.getByTestId("stat-per-week").textContent).toMatch(/\d,\d|\d/);
    const unit = screen.getByTestId("stat-unit").textContent!;
    expect(unit).toContain("Destination: U13 Unreal time");
    expect(unit).toContain("Grammar A: U2 Tenses");
    expect(unit).not.toContain("Reading");
    expect(unit).toContain("+1");
  });
  it("no curriculum progress: 'Chưa bắt đầu'", () => {
    render(<SessionStats learnerId={L} days={days} today={TODAY} cards={[]} />);
    expect(screen.getByTestId("stat-unit").textContent).toContain(sessionStatsCopy.unitNone);
  });
  it("calendar: 84 grid cells; a session day has a dot and a full label; the future is disabled", () => {
    render(<SessionStats learnerId={L} days={days} today={TODAY} cards={cards} />);
    expect(screen.getAllByRole("gridcell")).toHaveLength(84);
    const cell = screen.getByTestId("cell-2026-11-12");
    expect(cell.textContent).toContain("●");
    expect(cell.getAttribute("aria-label")).toBe("Thứ Năm 12/11/2026: có buổi học · U13 Unreal time");
    const future = screen.getAllByRole("gridcell").filter((c) => c.getAttribute("aria-disabled") === "true");
    expect(future).toHaveLength(1); // only Sunday 15/11 is after today
  });
  it("touching a day writes it below the calendar (aria-live)", () => {
    render(<SessionStats learnerId={L} days={days} today={TODAY} cards={cards} />);
    const detail = screen.getByTestId("week-detail");
    expect(detail.getAttribute("aria-live")).toBe("polite");
    fireEvent.click(screen.getByTestId("cell-2026-11-12"));
    expect(detail.textContent).toContain("Thứ Năm 12/11/2026");
    expect(detail.textContent).toContain("U13 Unreal time");
    fireEvent.click(screen.getByTestId("cell-2026-11-05"));
    expect(detail.textContent).toContain(sessionStatsCopy.sameDay);
  });
  it("monthly table: newest first, count, days with ⚠, and a link to the month sheet", () => {
    render(<SessionStats learnerId={L} days={days} today={TODAY} cards={cards} />);
    const rowsEl = screen.getAllByRole("row").filter((r) => r.getAttribute("data-testid")?.startsWith("month-row-"));
    expect(rowsEl.map((r) => r.getAttribute("data-testid"))).toEqual(["month-row-2026-11", "month-row-2026-10", "month-row-2026-09"]);
    const nov = screen.getByTestId("month-row-2026-11");
    expect(nov.textContent).toContain("03/11");
    expect(nov.textContent).toContain("05/11 ⚠");
    expect(screen.getByTestId("month-open-2026-11").getAttribute("href")).toBe(`/learners/${L}/notes/month/2026-11`);
  });
  it("no session yet: the empty line; the rule line is always there", () => {
    render(<SessionStats learnerId={L} days={[]} today={TODAY} cards={[]} />);
    expect(screen.getByTestId("sessions-none").textContent).toBe(sessionStatsCopy.none);
    expect(screen.queryByTestId("week-grid")).toBeNull();
    expect(screen.getByTestId("sessions-rule").textContent).toBe(sessionStatsCopy.rule);
  });
  it("a private-only day shows the day but no Units", () => {
    const d = sessionDays([note("2026-11-12", { id: "p", published: false })], [{ noteId: "p", curriculumId: "c1", unitCode: "U13" }], () => "Unreal time");
    render(<SessionStats learnerId={L} days={d} today={TODAY} cards={[]} />);
    expect(screen.getByTestId("cell-2026-11-12").getAttribute("aria-label")).toBe("Thứ Năm 12/11/2026: có buổi học");
  });
});
