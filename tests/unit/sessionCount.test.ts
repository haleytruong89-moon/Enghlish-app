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

// ---- 3B: marks, absences, billable sessions (rule S-1) ----
import { effectiveKinds, liveAbsences, monthBilling } from "@/lib/sessions/count";
import type { AbsenceRow, MarkRow } from "@/lib/sessions/types";

let mseq = 0;
const mk = (noteId: string, kind: MarkRow["kind"], o: Partial<MarkRow> = {}): MarkRow => ({ id: o.id ?? `m${++mseq}`.padStart(4, "0"), noteId, kind, makeupFor: null, reason: kind === "not_counted" ? "ghi nhầm" : null, createdAt: `2026-11-20T10:00:0${mseq % 10}Z`, ...o });
const ab = (id: string, on: string, o: Partial<AbsenceRow> = {}): AbsenceRow => ({ id, absentOn: on, requestedBy: "student", billable: false, cancelsId: null, note: null, createdAt: `${on}T08:00:00Z`, ...o });
const daysM = (rows: NoteRow[], marks: MarkRow[] = []) => sessionDays(rows, [], () => null, marks);
const eight = () => ["2026-11-02", "2026-11-04", "2026-11-06", "2026-11-09", "2026-11-11", "2026-11-13", "2026-11-16", "2026-11-18"].map((d) => note(d));
const bill = (rows: NoteRow[], absences: AbsenceRow[], marks: MarkRow[] = []) => monthBilling("2026-11", daysM(rows, marks), absences);

describe("3B billable sessions (Phân tích 4)", () => {
  it("8 regular + child absent 19/11 not billable + makeup 21/11 for 19/11: 9 held, 1 absence, 9 billable", () => {
    const mu = note("2026-11-21", { id: "mu" });
    const b = bill([...eight(), mu], [ab("a1", "2026-11-19")], [mk("mu", "makeup", { makeupFor: "a1" })]);
    expect(b).toMatchObject({ sessions: 9, makeups: 1, absences: { student: 1, tutor: 0, other: 0 }, billable: 9 });
  });
  it("8 regular + child absent 19/11 billable, no makeup: 8 held, 9 billable", () => {
    expect(bill(eight(), [ab("a1", "2026-11-19", { billable: true })])).toMatchObject({ sessions: 8, billable: 9 });
  });
  it("tutor absent 12/11 not billable; makeup 14/11 the same day as a regular note = 2 sessions that day", () => {
    const rows = [...eight().filter((n) => n.sessionDate !== "2026-11-11"), note("2026-11-14", { id: "r14" }), note("2026-11-14", { id: "mu14" })];
    const marks = [mk("mu14", "makeup", { makeupFor: "a1" })];
    const d = daysM(rows, marks);
    expect(d.find((x) => x.date === "2026-11-14")).toMatchObject({ sessions: 2, regular: true, makeup: true, sameDay: false });
    const b = monthBilling("2026-11", d, [ab("a1", "2026-11-12", { requestedBy: "tutor" })]);
    expect(b).toMatchObject({ sessions: 9, makeups: 1, absences: { tutor: 1 }, billable: 9 });
  });
  it("billable absence 19/11 then a makeup 26/11 for it: the makeup does not count twice", () => {
    const b = bill([...eight(), note("2026-11-26", { id: "mu" })], [ab("a1", "2026-11-19", { billable: true })], [mk("mu", "makeup", { makeupFor: "a1" })]);
    expect(b).toMatchObject({ sessions: 9, billable: 9 });
  });
  it("a makeup with no link counts as a plain extra session", () => {
    const b = bill([...eight(), note("2026-11-26", { id: "mu" })], [], [mk("mu", "makeup")]);
    expect(b).toMatchObject({ sessions: 9, makeups: 1, billable: 9 });
  });
  it("'Không tính' removes the note: 07/11 mistaken note, total -1", () => {
    const rows = [...eight(), note("2026-11-07", { id: "bad" })];
    expect(bill(rows, [], [mk("bad", "not_counted")]).sessions).toBe(8);
    expect(daysM(rows, [mk("bad", "not_counted")]).some((d) => d.date === "2026-11-07")).toBe(false);
  });
  it("a cancelled absence disappears; the makeup that pointed to it counts like a plain makeup", () => {
    const abs = [ab("a1", "2026-11-19", { billable: true }), ab("c1", "2026-11-19", { cancelsId: "a1", note: "ghi nhầm" })];
    expect(liveAbsences(abs)).toEqual([]);
    const b = bill([...eight(), note("2026-11-21", { id: "mu" })], abs, [mk("mu", "makeup", { makeupFor: "a1" })]);
    expect(b).toMatchObject({ sessions: 9, absenceTotal: 0, billable: 9 });
  });
  it("absences are counted in their own month and by who asked", () => {
    const abs = [ab("a1", "2026-10-30", { requestedBy: "other", billable: true }), ab("a2", "2026-11-03", { requestedBy: "other" }), ab("a3", "2026-11-05", { requestedBy: "tutor", billable: true })];
    const b = monthBilling("2026-11", daysM(eight()), abs);
    expect(b.absences).toEqual({ student: 0, tutor: 1, other: 1 });
    expect(b.billable).toBe(9);
    expect(b.absenceDates.map((a) => a.date)).toEqual(["2026-11-03", "2026-11-05"]);
  });
});

describe("3B marks follow the chain; the newest mark wins", () => {
  it("a mark on an old version still applies to the new version", () => {
    const rows = [note("2026-11-02", { id: "a" }), note("2026-11-02", { id: "b", supersedesId: "a" })];
    expect(effectiveKinds(rows, [mk("a", "makeup")]).get("b")?.kind).toBe("makeup");
    expect(daysM(rows, [mk("a", "makeup")])[0]).toMatchObject({ makeup: true, regular: false, sessions: 1 });
  });
  it("two marks: the latest; 'Không tính' then 'Thường' counts again", () => {
    const rows = [note("2026-11-02", { id: "a" })];
    const m1 = mk("a", "not_counted", { id: "0001", createdAt: "2026-11-05T10:00:00Z" });
    const m2 = mk("a", "regular", { id: "0002", createdAt: "2026-11-06T10:00:00Z" });
    expect(daysM(rows, [m1])).toEqual([]);
    expect(daysM(rows, [m1, m2]).map((d) => d.sessions)).toEqual([1]);
    expect(daysM(rows, [m2, m1]).map((d) => d.sessions)).toEqual([1]);
  });
  it("a supersedes loop does not hang the walk", () => {
    const rows = [note("2026-11-02", { id: "x", supersedesId: "y" }), note("2026-11-02", { id: "y", supersedesId: "x" }), note("2026-11-03", { id: "z", supersedesId: "x" })];
    expect(() => effectiveKinds(rows, [mk("x", "makeup")])).not.toThrow();
  });
  it("a makeup mark on a parent-only note does not create a counted session", () => {
    const rows = [note("2026-11-02", { id: "p", authorRole: "parent" })];
    const d = daysM(rows, [mk("p", "makeup")]);
    expect(d[0]).toMatchObject({ sessions: 0, parentOnly: true });
    expect(bill(rows, [], [mk("p", "makeup")])).toMatchObject({ sessions: 0, makeups: 0, billable: 0 });
  });
  it("two regular notes = 1 session flagged; two makeup notes = 1 makeup flagged; regular + makeup = 2, not flagged", () => {
    const two = daysM([note("2026-11-02", { id: "a" }), note("2026-11-02", { id: "b" })]);
    expect(two[0]).toMatchObject({ sessions: 1, sameDay: true });
    const mm = daysM([note("2026-11-02", { id: "a" }), note("2026-11-02", { id: "b" })], [mk("a", "makeup"), mk("b", "makeup")]);
    expect(mm[0]).toMatchObject({ sessions: 1, makeup: true, sameDay: true });
    const rm = daysM([note("2026-11-02", { id: "a" }), note("2026-11-02", { id: "b" })], [mk("b", "makeup")]);
    expect(rm[0]).toMatchObject({ sessions: 2, sameDay: false });
  });
});

describe("3B leaves the 3A numbers alone when there is nothing new", () => {
  it("no marks and no absences: same days, same months, same text as 3A", () => {
    const rows = [note("2026-11-03"), note("2026-11-05"), note("2026-11-05", { authorRole: "parent" }), note("2026-10-31"), note("2026-11-12", { published: false })];
    const plain = sessionDays(rows, [], () => null);
    const withEmpty = sessionDays(rows, [], () => null, []);
    expect(withEmpty).toEqual(plain);
    const m = months(plain, TODAY);
    expect(months(plain, TODAY, [])).toEqual(m);
    expect(m[0]!.sessions).toBe(3);
    expect(monthText("Nguyên", m[0]!)).toBe("Nguyên · Tháng 11/2026: 3 buổi — 03/11, 05/11, 12/11.");
    expect(m[0]!.billing).toMatchObject({ sessions: 3, billable: 3, absenceTotal: 0 });
  });
  it("months lists a month that has only an absence; the Zalo text carries absences and the billable count", () => {
    const abs = [ab("a1", "2026-11-19", { billable: false })];
    const mm = months(daysM([note("2026-11-03")]), TODAY, abs)[0]!;
    expect(monthText("Nguyên", mm)).toBe("Nguyên · Tháng 11/2026: 1 buổi — 03/11 · nghỉ 1 (con, không tính phí) · tính phí 1 buổi.");
    expect(months([], TODAY, abs).map((x) => x.month)).toEqual(["2026-11"]);
  });
  it("weekGrid marks the live absence day", () => {
    const g = weekGrid([], TODAY, 12, [ab("a1", "2026-11-12", { billable: true, requestedBy: "tutor" })]);
    const cell = g.flatMap((r) => r.cells).find((c) => c.date === "2026-11-12")!;
    expect(cell.absence).toEqual({ requestedBy: "tutor", billable: true });
  });
});
