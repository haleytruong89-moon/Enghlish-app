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

// ---- 3B ----
import { MonthTable } from "@/components/sessions/MonthTable";
import { months as monthsOf } from "@/lib/sessions/count";
import type { AbsenceRow, MarkRow } from "@/lib/sessions/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
const ab = (id: string, on: string, o: Partial<AbsenceRow> = {}): AbsenceRow => ({ id, absentOn: on, requestedBy: "student", billable: false, cancelsId: null, note: null, createdAt: on, ...o });
const mark = (noteId: string, kind: MarkRow["kind"], o: Partial<MarkRow> = {}): MarkRow => ({ id: `m-${noteId}`, noteId, kind, makeupFor: null, reason: null, createdAt: "2026-11-20T10:00:00Z", ...o });

describe("3B on the sessions page", () => {
  const nov = [note("2026-11-03", { id: "r1" }), note("2026-11-10", { id: "r2" }), note("2026-11-12", { id: "mu" })];
  const nd = sessionDays(nov, [], () => null, [mark("mu", "makeup", { makeupFor: "a1" })]);
  const absences = [ab("a1", "2026-11-05", { billable: true }), ab("a2", "2026-11-07", { requestedBy: "tutor" })];
  it("the calendar marks makeup days with B and absence days with N (text, not only colour), both in the aria-label", () => {
    render(<SessionStats learnerId={L} days={nd} today={TODAY} cards={[]} absences={absences} billing />);
    expect(screen.getByTestId("cell-makeup-2026-11-12").textContent).toBe("B");
    expect(screen.getByTestId("cell-absence-2026-11-05").textContent).toBe("N");
    expect(screen.getByTestId("cell-2026-11-12").getAttribute("aria-label")).toContain("học bù");
    expect(screen.getByTestId("cell-2026-11-05").getAttribute("aria-label")).toContain("nghỉ (con, có tính phí)");
    expect(screen.getByTestId("cell-2026-11-07").getAttribute("aria-label")).toContain("nghỉ (thầy/cô, không tính phí)");
    fireEvent.click(screen.getByTestId("cell-2026-11-05"));
    expect(screen.getByTestId("week-detail").textContent).toContain("05/11 · con, có tính phí");
  });
  it("the month table gets Học bù · Nghỉ (con / thầy/cô / khác) · Buổi tính phí; billable = 3 held + 1 billable absence - 1 linked makeup", () => {
    render(<SessionStats learnerId={L} days={nd} today={TODAY} cards={[]} absences={absences} billing />);
    expect(screen.getByTestId("month-makeups-2026-11").textContent).toBe("1");
    expect(screen.getByTestId("month-absences-2026-11").textContent).toBe("1 / 1 / 0");
    expect(screen.getByTestId("month-billable-2026-11").textContent).toBe("3");
    expect(screen.getByText(sessionStatsCopy.monthTable.billable)).toBeTruthy();
  });
  it("the absence form and the rule are on the page", () => {
    render(<SessionStats learnerId={L} days={nd} today={TODAY} cards={[]} absences={absences} billing />);
    expect(screen.getByTestId("absence-form")).toBeTruthy();
    expect(screen.getByTestId("billing-rule")).toBeTruthy();
  });
  it("before 0030: the 3A block as it was, plus one line saying the part is not ready; no 3B columns, no form", () => {
    render(<SessionStats learnerId={L} days={nd} today={TODAY} cards={[]} />);
    expect(screen.getByTestId("billing-unavailable").textContent).toContain("chưa sẵn sàng");
    expect(screen.queryByTestId("absence-form")).toBeNull();
    expect(screen.queryByTestId("month-billable-2026-11")).toBeNull();
    expect(screen.getByTestId("sessions-rule")).toBeTruthy();
  });
  it("a month with only an absence still has a row", () => {
    const m = monthsOf([], TODAY, [ab("a1", "2026-11-05")]);
    render(<MonthTable learnerId={L} months={m} billing />);
    expect(screen.getByTestId("month-absences-2026-11").textContent).toBe("1 / 0 / 0");
    expect(screen.getByTestId("month-billable-2026-11").textContent).toBe("0");
  });
  it("no money anywhere on the page", () => {
    const { container } = render(<SessionStats learnerId={L} days={nd} today={TODAY} cards={[]} absences={absences} billing />);
    expect(container.textContent).not.toMatch(/₫|đồng|VND|học phí|giá/i);
  });
});
