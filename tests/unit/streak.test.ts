import { describe, expect, it } from "vitest";
import type { GoalRow } from "@/lib/student/goal";
import { countsByWeek, currentStreak, longestRun, streakEverDate, totalWeeksMet, weekHistory, weekResult, weeksMetDate, STREAK_MAX_WEEKS, type WorkWeek } from "@/lib/student/streak";
import { buildWeekView, type WeekFacts } from "@/lib/student/weekView";
import { addWeeks, appliesFromVn } from "@/lib/student/week";

const W = "2026-11-09"; // Monday 09/11 – Sunday 15/11/2026
let n = 0;
/** An agreed goal that applies from Monday `from` (the database sets it; here it is given). */
const goal = (pieces: number, from: string): GoalRow => ({ id: `d${(n += 1)}`, kind: "accept", pieces, appliesFrom: from, respondsTo: `p${n}`, byRole: "tutor", createdAt: `2026-01-${String((n % 28) + 1).padStart(2, "0")}T03:00:00Z` });
/** `k` distinct pieces of work in week `w`. */
const pieces = (w: string, k: number, prefix = "a"): WorkWeek[] => Array.from({ length: k }, (_, i) => ({ k: `${prefix}:${w}:${i}`, w }));
const run = (weeks: [string, number][]): WorkWeek[] => weeks.flatMap(([w, k]) => pieces(w, k));
const streakOf = (goals: GoalRow[], works: WorkWeek[], current: string) => currentStreak(goals, countsByWeek(works), current);

describe("pieces per week", () => {
  it("one piece of work counts once per week, however many times it was sent; the same piece next week counts again", () => {
    const works: WorkWeek[] = [{ k: "s:pdf", w: W }, { k: "s:pdf", w: W }, { k: "a:1", w: W }, { k: "s:pdf", w: "2026-11-16" }];
    const c = countsByWeek(works);
    expect(c.get(W)).toBe(2);
    expect(c.get("2026-11-16")).toBe(1);
    expect(c.get("2026-11-23")).toBeUndefined();
  });
});

describe("plan example 3.6 — goal 4, week 09/11–15/11", () => {
  // Studio (Mon), a photo of a PDF (Thu) sent again the same day, a writing task that was only saved, a link (Sunday 23:50), a second Studio (Sunday 21:00)
  const facts = (now: string, works: WorkWeek[]): WeekFacts => ({
    now, range: { min: 3, max: 6 }, goals: [goal(4, "2026-10-26")], works, firstWorkAt: "2026-10-27T03:00:00Z", writes: [], firstTopicAt: null, firstRevisionAt: null, unitEvents: [],
  });
  const works: WorkWeek[] = [{ k: "a:studio1", w: W }, { k: "s:pdf", w: W }, { k: "s:pdf", w: W }, { k: "s:link", w: W }, { k: "a:studio2", w: W }];
  it("4 pieces (the PDF counts once; the unsent writing counts for nothing) → the goal is met", () => {
    const v = buildWeekView(facts("2026-11-15T16:50:00Z", works)); // Sunday 23:50 in Vietnam
    expect(v).toMatchObject({ week: W, goal: 4, count: 4, met: true, remaining: 0, rangeLabel: "09/11 – 15/11" });
  });
  it("opening a link three times and sending no photo is 0 pieces", () => {
    expect(buildWeekView(facts("2026-11-12T03:00:00Z", [])).count).toBe(0);
  });
  it("3 pieces: not met, 1 to go", () => {
    expect(buildWeekView(facts("2026-11-15T16:50:00Z", [works[0]!, works[1]!, works[3]!])))
      .toMatchObject({ count: 3, met: false, remaining: 1 });
  });
  it("a piece sent one second after the week ended belongs to the NEXT week", () => {
    const v = buildWeekView(facts("2026-11-15T17:00:00Z", works)); // Monday 00:00 in Vietnam: a new, empty week
    expect(v).toMatchObject({ week: "2026-11-16", count: 0, met: false, remaining: 4, rangeLabel: "16/11 – 22/11" });
  });
});

describe("the soft streak (plan 3.6)", () => {
  const goals = [goal(4, "2026-10-05")];
  const fiveMet = run([["2026-10-12", 4], ["2026-10-19", 4], ["2026-10-26", 5], ["2026-11-02", 4], [W, 4]]);

  it("a streak of 5; the running week adds one only when it already met the goal", () => {
    expect(streakOf(goals, fiveMet, "2026-11-16")).toBe(5);
    expect(streakOf(goals, [...fiveMet, ...pieces("2026-11-16", 3)], "2026-11-16")).toBe(5); // the running week NEVER breaks the streak
    expect(streakOf(goals, [...fiveMet, ...pieces("2026-11-16", 4)], "2026-11-16")).toBe(6);
    expect(streakOf(goals, fiveMet, "2026-11-16")).toBe(5);
  });
  it("example: 3 pieces in 16–22/11, 1 piece in the running week 23–29/11 → the streak is 0", () => {
    const works = [...fiveMet, ...pieces("2026-11-16", 3), ...pieces("2026-11-23", 1)];
    expect(streakOf(goals, works, "2026-11-23")).toBe(0);
    // the week after a miss starts again: 4 pieces in the running week make 1
    expect(streakOf(goals, [...fiveMet, ...pieces("2026-11-16", 3), ...pieces("2026-11-23", 4)], "2026-11-23")).toBe(1);
  });
  it("a finished week with no agreed goal sets the streak to 0 (no goal = not met); so does a week with no work", () => {
    expect(streakOf([goal(4, "2026-11-02")], run([["2026-11-02", 4], [W, 4]]), "2026-11-16")).toBe(2);
    expect(streakOf([goal(4, "2026-11-09")], run([["2026-11-02", 4], [W, 4]]), "2026-11-16")).toBe(1); // 02/11 was before the goal
    expect(streakOf([], run([[W, 9]]), "2026-11-16")).toBe(0);
    expect(streakOf(goals, run([["2026-10-19", 4], ["2026-11-02", 4], [W, 4]]), "2026-11-16")).toBe(2); // 26/10 missing breaks the chain
  });
  it("a goal change applies to the weeks it covers: raising the goal can turn an old week into a miss only from its Monday on", () => {
    const g = [goal(3, "2026-10-05"), goal(5, "2026-11-02")];
    expect(streakOf(g, run([["2026-10-26", 3], ["2026-11-02", 5], [W, 5]]), "2026-11-16")).toBe(3);
    expect(streakOf(g, run([["2026-10-26", 3], ["2026-11-02", 4], [W, 5]]), "2026-11-16")).toBe(1); // 4 < 5 from 02/11
  });
  it("is capped at 52 finished weeks (+ the running week) and does not look further back", () => {
    const g = [goal(1, "2024-01-01")];
    const works = Array.from({ length: 80 }, (_, i) => pieces(addWeeks("2025-06-02", i), 1)).flat();
    const current = addWeeks("2025-06-02", 79);
    expect(STREAK_MAX_WEEKS).toBe(52);
    expect(streakOf(g, works, current)).toBe(53); // 52 earlier weeks + the running one (it met the goal)
    expect(streakOf(g, works.filter((w) => w.w !== current), current)).toBe(52);
  });
  it("weeks across the new year", () => {
    const g = [goal(2, "2026-12-07")];
    const works = run([["2026-12-14", 2], ["2026-12-21", 3], ["2026-12-28", 2], ["2027-01-04", 2]]);
    expect(streakOf(g, works, "2027-01-11")).toBe(4);
  });
  it("week results and history", () => {
    const g = [goal(4, "2026-11-02")];
    const c = countsByWeek(run([["2026-11-02", 4], [W, 3]]));
    expect(weekResult(g, c, "2026-11-02")).toEqual({ week: "2026-11-02", goal: 4, count: 4, met: true });
    expect(weekResult(g, c, W)).toEqual({ week: W, goal: 4, count: 3, met: false });
    expect(weekResult(g, c, "2026-10-26")).toEqual({ week: "2026-10-26", goal: null, count: 0, met: false });
    expect(weekHistory(g, c, "2026-11-16").map((h) => h.met)).toEqual([true, false, false]);
    expect(weekHistory([], c, "2026-11-16")).toEqual([]);
    expect(weekHistory(g, c, "2026-10-26")).toEqual([]); // the first goal has not started yet
  });
});

describe("history-based numbers (achievements)", () => {
  const g = [goal(2, "2026-09-07")];
  // met, met, missed, met, met, met  (07/09 … 12/10)
  const works = run([["2026-09-07", 2], ["2026-09-14", 2], ["2026-09-28", 3], ["2026-10-05", 2], ["2026-10-12", 2]]);
  const history = weekHistory(g, countsByWeek(works), "2026-10-12");
  it("longest run, weeks met, and the day each number was reached (the Sunday that closes the week, or today for the running week)", () => {
    expect(history.map((h) => h.met)).toEqual([true, true, false, true, true, true]);
    expect(longestRun(history)).toBe(3);
    expect(totalWeeksMet(history)).toBe(5);
    expect(streakEverDate(history, 2, "2026-10-14")).toBe("2026-09-20");
    expect(streakEverDate(history, 3, "2026-10-14")).toBe("2026-10-14"); // reached in the running week (ends 18/10): dated today
    expect(streakEverDate(history, 4, "2026-10-14")).toBeNull();
    expect(weeksMetDate(history, 4, "2026-10-25")).toBe("2026-10-11");
    expect(weeksMetDate(history, 5, "2026-10-25")).toBe("2026-10-18");
    expect(weeksMetDate(history, 6, "2026-10-25")).toBeNull();
  });
});

describe("timezone and clock", () => {
  it("the week of a piece is decided by the database; the view uses the database 'now' only", () => {
    const base: WeekFacts = { now: "2026-11-15T16:59:59Z", range: { min: 2, max: 5 }, goals: [goal(2, "2026-11-09")], works: pieces(W, 2), firstWorkAt: null, writes: [], firstTopicAt: null, firstRevisionAt: null, unitEvents: [] };
    expect(buildWeekView(base)).toMatchObject({ week: W, met: true, streak: 1, today: "2026-11-15", nextMonday: "2026-11-16" });
    expect(buildWeekView({ ...base, now: "2026-11-15T17:00:00Z" })).toMatchObject({ week: "2026-11-16", met: false, streak: 1, today: "2026-11-16", nextMonday: "2026-11-23" });
    expect(appliesFromVn("2026-11-15T17:00:00Z")).toBe("2026-11-23");
  });
});
