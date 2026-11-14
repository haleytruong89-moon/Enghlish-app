import { describe, expect, it } from "vitest";
import { currentNotes, dayMonth, months, monthText, sessionDays, stats, weekGrid, weekStart } from "@/lib/sessions/count";
import type { NoteRow, TaughtRow } from "@/lib/sessions/types";

let seq = 0;
const note = (date: string, o: Partial<NoteRow> = {}): NoteRow => ({ id: o.id ?? `n${++seq}`, sessionDate: date, supersedesId: null, authorRole: "tutor", published: true, createdAt: `${date}T10:00:00Z`, ...o });
const days = (rows: NoteRow[], taught: TaughtRow[] = []) => sessionDays(rows, taught, (c, code) => (code === "U13" ? "Unreal time" : null));
const TODAY = "2026-11-14"; // Saturday

describe("one session = one VN day with a current note (DOMAIN §5.6)", () => {
  it("03/11, 05/11 and a second note on 05/11 = 2 sessions in November, 05/11 flagged", () => {
    const d = days([note("2026-11-03"), note("2026-11-05"), note("2026-11-05", { authorRole: "parent" })]);
    const m = months(d, TODAY)[0]!;
    expect(m.month).toBe("2026-11");
    expect(m.sessions).toBe(2);
    expect(d.find((x) => x.date === "2026-11-05")).toMatchObject({ sameDay: true, sessions: 1, authors: ["tutor", "parent"] });
    expect(d.find((x) => x.date === "2026-11-03")!.sameDay).toBe(false);
  });
  it("a note edited to another day moves the session; the total does not change", () => {
    const old = note("2026-11-10", { id: "old" });
    const fixed = note("2026-11-11", { supersedesId: "old" });
    const d = days([old, fixed]);
    expect(d.map((x) => x.date)).toEqual(["2026-11-11"]);
    expect(stats(d, TODAY).total).toBe(1);
  });
  it("a chain of 3 versions counts only the last one", () => {
    const rows = [note("2026-11-02", { id: "a" }), note("2026-11-03", { id: "b", supersedesId: "a" }), note("2026-11-04", { id: "c", supersedesId: "b" })];
    expect(currentNotes(rows).map((r) => r.id)).toEqual(["c"]);
    expect(days(rows).map((x) => x.date)).toEqual(["2026-11-04"]);
  });
  it("a supersedes loop (bad data) terminates", () => {
    expect(days([note("2026-11-02", { id: "a", supersedesId: "b" }), note("2026-11-02", { id: "b", supersedesId: "a" })])).toEqual([]);
  });
  it("a private note (not shared) counts as a day for everyone, but has no Units", () => {
    const n = note("2026-11-12", { id: "p", published: false });
    const d = days([n], [{ noteId: "p", curriculumId: "c1", unitCode: "U13" }]);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ privateOnly: true, units: [] });
  });
  it("a day with a shared and a private note shows only the shared note's Units", () => {
    const rows = [note("2026-11-12", { id: "s" }), note("2026-11-12", { id: "p", published: false })];
    const d = days(rows, [{ noteId: "s", curriculumId: "c1", unitCode: "U13" }, { noteId: "p", curriculumId: "c1", unitCode: "U14" }, { noteId: "s", curriculumId: "c1", unitCode: "U13" }]);
    expect(d[0]!.privateOnly).toBe(false);
    expect(d[0]!.units).toEqual([{ code: "U13", title: "Unreal time" }]);
  });
  it("month boundary: 31/10 and 01/11 are in different months", () => {
    const m = months(days([note("2026-10-31"), note("2026-11-01")]), TODAY);
    expect(m.map((x) => [x.month, x.sessions])).toEqual([["2026-11", 1], ["2026-10", 1]]);
  });
  it("months lists empty months in between, newest first, up to today's month", () => {
    const m = months(days([note("2026-08-20")]), TODAY);
    expect(m.map((x) => [x.month, x.sessions])).toEqual([["2026-11", 0], ["2026-10", 0], ["2026-09", 0], ["2026-08", 1]]);
    expect(months([], TODAY)).toEqual([]);
  });
  it("year change", () => {
    const m = months(days([note("2025-12-30")]), "2026-02-02");
    expect(m.map((x) => x.month)).toEqual(["2026-02", "2026-01", "2025-12"]);
  });
});

describe("stats", () => {
  it("weekStart is Monday", () => {
    expect(weekStart("2026-11-14")).toBe("2026-11-09");
    expect(weekStart("2026-11-15")).toBe("2026-11-09");
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
  });
  it("12 sessions in the 8 full weeks = 1.5 / week; the running week is not counted", () => {
    const dates = ["2026-09-14", "2026-09-24", "2026-09-28", "2026-10-01", "2026-10-05", "2026-10-08", "2026-10-12", "2026-10-15", "2026-10-19", "2026-10-22", "2026-10-26", "2026-10-29"];
    const rows = [...dates.map((x) => note(x)), note("2026-11-10"), note("2026-11-12")]; // two in the running week
    const s = stats(days(rows), TODAY);
    expect(s.perWeek).toBe(1.5);
    expect(s.total).toBe(14);
    expect(s.thisMonth).toBe(2);
    expect(s.last).toBe("2026-11-12");
  });
  it("older than 8 weeks is not counted", () => {
    const s = stats(days([note("2026-06-01"), note("2026-10-20"), note("2026-10-27")]), TODAY);
    expect(s.perWeek).toBe(0.3); // 2 in the last 8 full weeks / 8
  });
  it("a newer first session divides by the full weeks since its week (at least 1)", () => {
    // first session Mon 26/10: weeks 26/10 and 02/11 are full -> 2 weeks
    const s = stats(days([note("2026-10-26"), note("2026-10-28"), note("2026-11-03"), note("2026-11-05")]), TODAY);
    expect(s.perWeek).toBe(2);
  });
  it("no full week yet (first session in the running week) or no session: null", () => {
    expect(stats(days([note("2026-11-10")]), TODAY).perWeek).toBeNull();
    expect(stats([], TODAY)).toEqual({ total: 0, thisMonth: 0, perWeek: null, last: null });
  });
});

describe("weekGrid", () => {
  it("12 rows x 7, Monday first, last row holds today, later days are future", () => {
    const g = weekGrid(days([note("2026-11-12")]), TODAY);
    expect(g).toHaveLength(12);
    expect(g.every((r) => r.cells.length === 7)).toBe(true);
    expect(g[0]!.weekStart).toBe("2026-08-24");
    const last = g[11]!;
    expect(last.weekStart).toBe("2026-11-09");
    expect(last.cells.map((c) => c.future)).toEqual([false, false, false, false, false, false, true]);
    expect(last.cells[3]!.date).toBe("2026-11-12");
    expect(last.cells[3]!.day?.date).toBe("2026-11-12");
    expect(last.cells[0]!.day).toBeNull();
  });
});

describe("monthText (U25)", () => {
  it("the sentence for Zalo", () => {
    const m = months(days([note("2026-11-03"), note("2026-11-05"), note("2026-11-10"), note("2026-11-12"), note("2026-11-14")]), TODAY)[0]!;
    expect(monthText("Nguyên", m)).toBe("Nguyên · Tháng 11/2026: 5 buổi — 03/11, 05/11, 10/11, 12/11, 14/11.");
    expect(dayMonth("2026-11-03")).toBe("03/11");
  });
  it("an empty month", () => {
    const m = months(days([note("2026-10-03")]), TODAY)[0]!;
    expect(monthText("Nguyên", m)).toBe("Nguyên · Tháng 11/2026: chưa có buổi.");
  });
});

describe("only tutor notes count as a buổi (billing safety, parent to confirm)", () => {
  const rows = [note("2026-11-03"), note("2026-11-05", { authorRole: "parent" }), note("2026-11-10"), note("2026-11-12", { authorRole: "parent" }), note("2026-11-12")];
  it("a parent-only day is listed (parentOnly) but is out of totals, month counts, average and last", () => {
    const d = days(rows);
    expect(d.map((x) => [x.date, x.sessions, x.parentOnly])).toEqual([["2026-11-03", 1, false], ["2026-11-05", 0, true], ["2026-11-10", 1, false], ["2026-11-12", 1, false]]);
    const m = months(d, TODAY)[0]!;
    expect(m.sessions).toBe(3);
    expect(m.days).toHaveLength(4);
    const s = stats(d, TODAY);
    expect(s.total).toBe(3);
    expect(s.thisMonth).toBe(3);
    expect(s.last).toBe("2026-11-12");
  });
  it("the Zalo text lists only counted days", () => {
    expect(monthText("Nguyên", months(days(rows), TODAY)[0]!)).toBe("Nguyên · Tháng 11/2026: 3 buổi — 03/11, 10/11, 12/11.");
  });
  it("only parent notes: zero sessions, no last, no average", () => {
    const d = days([note("2026-10-01", { authorRole: "parent" })]);
    expect(stats(d, TODAY)).toEqual({ total: 0, thisMonth: 0, perWeek: null, last: null });
    expect(monthText("Nguyên", months(d, TODAY)[0]!)).toBe("Nguyên · Tháng 11/2026: chưa có buổi.");
  });
  it("the days that go to client components carry no note or curriculum ids", () => {
    const d = days([note("2026-11-03", { id: "11111111-2222-3333-4444-555555555555" })], [{ noteId: "11111111-2222-3333-4444-555555555555", curriculumId: "99999999-2222-3333-4444-555555555555", unitCode: "U13" }]);
    const json = JSON.stringify({ d, grid: weekGrid(d, TODAY), months: months(d, TODAY) });
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});
