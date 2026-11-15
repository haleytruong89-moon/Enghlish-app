import { describe, expect, it } from "vitest";
import { firstGoalWeek, goalForWeek, goalOptions, pendingProposal, recentRange, upcomingGoal, type GoalRow } from "@/lib/student/goal";
import { appliesFromVn } from "@/lib/student/week";

let n = 0;
const row = (o: Partial<GoalRow> & Pick<GoalRow, "kind">): GoalRow => ({
  id: `g${(n += 1)}`, pieces: o.kind === "withdraw" ? null : 4, appliesFrom: null, respondsTo: null, byRole: o.kind === "propose" || o.kind === "withdraw" ? "student" : "tutor",
  createdAt: `2026-11-${String(10 + n).padStart(2, "0")}T03:00:00Z`, ...o,
});
/** A decision taken at `at` (as the database sets it: the next Monday in Vietnam). */
const decided = (kind: "accept" | "adjust", pieces: number, at: string, respondsTo = "p"): GoalRow =>
  row({ kind, pieces, appliesFrom: appliesFromVn(at), respondsTo, createdAt: at });

describe("the goal of a week (S-6: a decision counts from the next Monday)", () => {
  it("plan example 3: agreed on Sunday 15/11 21:00 → applies from Monday 16/11; the running week keeps the old goal", () => {
    const old = decided("accept", 4, "2026-11-02T03:00:00Z");
    const fresh = decided("adjust", 5, "2026-11-15T14:00:00Z");
    expect(fresh.appliesFrom).toBe("2026-11-16");
    expect(goalForWeek([old, fresh], "2026-11-09")).toBe(4);
    expect(goalForWeek([old, fresh], "2026-11-16")).toBe(5);
    expect(goalForWeek([old, fresh], "2026-11-23")).toBe(5);
  });
  it("the very first goal also starts next Monday: the week it was agreed in has no goal", () => {
    const first = decided("accept", 3, "2026-11-12T03:00:00Z");
    expect(goalForWeek([first], "2026-11-09")).toBeNull();
    expect(goalForWeek([first], "2026-11-16")).toBe(3);
    expect(firstGoalWeek([first])).toBe("2026-11-16");
    expect(firstGoalWeek([])).toBeNull();
  });
  it("a proposal, a withdrawal and a goal that waits change nothing", () => {
    const p = row({ kind: "propose", pieces: 6 });
    expect(goalForWeek([p, row({ kind: "withdraw", respondsTo: p.id })], "2026-12-07")).toBeNull();
  });
  it("the newest decision wins when two start the same Monday", () => {
    const a = decided("accept", 4, "2026-11-10T03:00:00Z");
    const b = decided("adjust", 6, "2026-11-12T03:00:00Z");
    expect(a.appliesFrom).toBe(b.appliesFrom);
    expect(goalForWeek([a, b], "2026-11-16")).toBe(6);
    expect(goalForWeek([b, a], "2026-11-16")).toBe(6); // the order of the list does not matter
  });
  it("an announced goal: shown only while it differs from the running one", () => {
    const old = decided("accept", 4, "2026-11-02T03:00:00Z");
    const same = decided("accept", 4, "2026-11-12T03:00:00Z");
    const more = decided("adjust", 5, "2026-11-12T04:00:00Z");
    expect(upcomingGoal([old], "2026-11-09")).toBeNull();
    expect(upcomingGoal([old, same], "2026-11-09")).toBeNull();
    expect(upcomingGoal([old, more], "2026-11-09")).toEqual({ pieces: 5, from: "2026-11-16", kind: "adjust" });
    expect(upcomingGoal([old, more], "2026-11-16")).toBeNull(); // it has started
  });
  it("times are compared as instants: Postgres text with +00 and different fraction lengths still orders right", () => {
    const first = decided("accept", 3, "2026-11-12 03:00:00.5+00");
    const second = decided("adjust", 6, "2026-11-12T03:00:00.25Z");
    const early = { ...first, appliesFrom: "2026-11-16" };
    const late = { ...second, appliesFrom: "2026-11-16" };
    // 03:00:00.50 is LATER than 03:00:00.25 although "…5+00" < "…25Z" as plain text compares the other way round
    expect(goalForWeek([early, late], "2026-11-16")).toBe(3);
  });
});

describe("the proposal that waits", () => {
  it("none, one waiting, answered, withdrawn", () => {
    expect(pendingProposal([])).toBeNull();
    const p = row({ kind: "propose", pieces: 5 });
    expect(pendingProposal([p])?.id).toBe(p.id);
    expect(pendingProposal([p, decided("accept", 5, "2026-11-12T03:00:00Z", p.id)])).toBeNull();
    expect(pendingProposal([p, row({ kind: "withdraw", respondsTo: p.id })])).toBeNull();
    const p2 = row({ kind: "propose", pieces: 4 });
    expect(pendingProposal([p, row({ kind: "withdraw", respondsTo: p.id }), p2])?.id).toBe(p2.id);
  });
});

describe("the hint under the buttons: the 4 newest FULL weeks", () => {
  const counts = new Map([["2026-10-19", 3], ["2026-10-26", 5], ["2026-11-02", 4], ["2026-11-09", 4]]);
  it("smallest and largest of the four weeks before the running one; the running week is not part of it", () => {
    expect(recentRange(counts, "2026-11-16", "2026-10-19")).toEqual({ low: 3, high: 5 });
    expect(recentRange(new Map([...counts, ["2026-11-16", 9]]), "2026-11-16", "2026-10-19")).toEqual({ low: 3, high: 5 });
  });
  it("weeks before the first work say nothing; a missed week inside counts as 0", () => {
    expect(recentRange(counts, "2026-11-16", "2026-11-02")).toEqual({ low: 4, high: 4 }); // only 02/11 and 09/11
    expect(recentRange(new Map([["2026-10-26", 4], ["2026-11-09", 4]]), "2026-11-16", "2026-10-26")).toEqual({ low: 0, high: 4 });
  });
  it("no full week yet, or nothing sent in them → no sentence", () => {
    expect(recentRange(counts, "2026-11-16", null)).toBeNull();
    expect(recentRange(counts, "2026-11-16", "2026-11-16")).toBeNull();
    expect(recentRange(new Map(), "2026-11-16", "2026-11-02")).toBeNull();
  });
});

describe("the options the child can pick", () => {
  it("every whole number of the track's range (data, not a branch on the track)", () => {
    expect(goalOptions({ min: 2, max: 5 })).toEqual([2, 3, 4, 5]);
    expect(goalOptions({ min: 3, max: 6 })).toEqual([3, 4, 5, 6]);
  });
});
