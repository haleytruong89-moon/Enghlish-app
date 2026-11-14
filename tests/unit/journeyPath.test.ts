import { describe, expect, it } from "vitest";
import { buildJourney, type JourneyUnitInput } from "@/lib/journey/path";
import type { ChildMilestone } from "@/lib/roadmap/types";

const unit = (n: number, status: JourneyUnitInput["status"] = "not_started", skipped = false): JourneyUnitInput => ({
  code: `U${n}`, ord: n, title: `Unit ${n}`, skipped, status, doneOn: status === "done" ? "2026-11-01" : null,
});
const units = (n: number, over: Record<number, JourneyUnitInput["status"]> = {}, skippedIn: number[] = []) =>
  Array.from({ length: n }, (_, i) => unit(i + 1, over[i + 1] ?? "not_started", skippedIn.includes(i + 1)));
const flag = (id: string, title: string, afterUnit: string | null, curriculumId: string | null = "c1"): ChildMilestone => ({
  id, kind: "progress_test", role: "flag", title, curriculumId, afterUnit, targetMonth: null, approx: false,
});
const main = { id: "c1", title: "Destination B1" };

describe("buildJourney (plan 3.3 examples)", () => {
  it("26 Units, U1-U4 + U7 done, U5 in progress, U3 skipped: N=25, done=4, climber on U5, 7 Units to Progress Test 1", () => {
    const j = buildJourney({
      main, others: [], milestones: [flag("m1", "Progress Test 1", "U12")],
      units: units(26, { 1: "done", 2: "done", 4: "done", 5: "in_progress", 7: "done" }, [3]),
    });
    expect(j.summary).toEqual({ kind: "toMilestone", done: 4, total: 25, remaining: 7, title: "Progress Test 1" });
    expect(j.climber).toEqual({ at: "unit", code: "U5", kind: "here" });
    expect(j.nodes.find((n) => n.code === "U3")?.status).toBe("skipped");
    expect(j.nodes.find((n) => n.code === "U12")?.flags[0]).toMatchObject({ remaining: 7, reached: false, next: true });
  });

  it("two Units in progress: the climber is on the higher one, both keep their own state", () => {
    const j = buildJourney({ main, others: [], milestones: [], units: units(10, { 5: "in_progress", 9: "in_progress" }) });
    expect(j.climber).toEqual({ at: "unit", code: "U9", kind: "here" });
    expect(j.nodes.filter((n) => n.status === "in_progress").map((n) => n.code)).toEqual(["U5", "U9"]);
    expect(j.nodes.filter((n) => n.climber).map((n) => n.code)).toEqual(["U9"]);
  });

  it("nothing in progress: the climber is on the highest done Unit (just finished); nothing at all: at the foot", () => {
    expect(buildJourney({ main, others: [], milestones: [], units: units(5, { 1: "done", 2: "done" }) }).climber).toEqual({ at: "unit", code: "U2", kind: "justDone" });
    expect(buildJourney({ main, others: [], milestones: [], units: units(5) }).climber).toEqual({ at: "foot" });
  });

  it("a flag whose Unit left the version is not drawn: it goes to 'Mốc khác'", () => {
    const j = buildJourney({ main, others: [], milestones: [flag("m1", "Thi thử", "U20")], units: units(10) });
    expect(j.nodes.some((n) => n.flags.length > 0)).toBe(false);
    expect(j.otherMilestones.map((m) => m.title)).toEqual(["Thi thử"]);
    expect(j.summary).toMatchObject({ kind: "toSummit", remaining: 10 });
  });

  it("a flag with only a month (no Unit) is listed under 'Mốc khác'", () => {
    const m: ChildMilestone = { ...flag("m1", "Thi thử vào 10", null), targetMonth: "2027-03-01" };
    const j = buildJourney({ main, others: [], milestones: [m], units: units(3) });
    expect(j.otherMilestones[0]).toMatchObject({ title: "Thi thử vào 10", targetMonth: "2027-03-01" });
  });

  it("no curriculum yet: empty mountain, summit unnamed", () => {
    const j = buildJourney({ main: null, others: [], milestones: [], units: [] });
    expect(j.hasMain).toBe(false);
    expect(j.nodes).toEqual([]);
    expect(j.climber).toBeNull();
    expect(j.summary).toEqual({ kind: "none" });
    expect(j.summit).toBeNull();
  });

  it("summit and 'after the summit' come from confirmed milestones only", () => {
    const summit: ChildMilestone = { id: "s", kind: "goal", role: "summit", title: "Lên B1", curriculumId: null, afterUnit: null, targetMonth: "2027-06-01", approx: false };
    const b2: ChildMilestone = { id: "b2", kind: "goal", role: "beyond", title: "B2 sơ cấp", curriculumId: null, afterUnit: null, targetMonth: "2027-12-01", approx: true };
    const b1: ChildMilestone = { ...b2, id: "b1", title: "Thi chứng chỉ", targetMonth: "2027-09-01", approx: false };
    const j = buildJourney({ main, others: [], milestones: [b2, summit, b1], units: units(3) });
    expect(j.summit).toEqual({ title: "Lên B1", targetMonth: "2027-06-01", approx: false });
    expect(j.beyond.map((b) => b.title)).toEqual(["Thi chứng chỉ", "B2 sơ cấp"]);
  });

  it("reached flag: k = 0; the next flag is the first one with k > 0; all done: finished", () => {
    const j = buildJourney({
      main, others: [], milestones: [flag("a", "PT1", "U2"), flag("b", "PT2", "U4")],
      units: units(4, { 1: "done", 2: "done" }),
    });
    expect(j.nodes[1]?.flags[0]).toMatchObject({ reached: true, remaining: 0, next: false });
    expect(j.summary).toMatchObject({ kind: "toMilestone", title: "PT2", remaining: 2 });
    expect(buildJourney({ main, others: [], milestones: [], units: units(3, { 1: "done", 2: "done", 3: "done" }) }).summary).toEqual({ kind: "finished", done: 3, total: 3 });
  });

  it("out-of-order learning: each dot shows its own state; the bold line only joins two neighbouring done Units", () => {
    const j = buildJourney({ main, others: [], milestones: [], units: units(6, { 1: "done", 2: "done", 5: "done" }) });
    expect(j.nodes.map((n) => n.status)).toEqual(["done", "done", "not_started", "not_started", "done", "not_started"]);
    expect(j.nodes.map((n) => n.doneToNext)).toEqual([true, false, false, false, false, false]);
  });

  it("a Unit whose latest event is 'skipped' is not counted either", () => {
    const j = buildJourney({ main, others: [], milestones: [], units: [unit(1, "done"), unit(2, "skipped"), unit(3)] });
    expect(j.summary).toMatchObject({ kind: "toSummit", done: 1, total: 2, remaining: 1 });
  });

  it("other curricula are passed through", () => {
    const j = buildJourney({ main, others: [{ id: "c2", title: "Grammar", done: 2, total: 10 }], milestones: [], units: units(2) });
    expect(j.others).toEqual([{ id: "c2", title: "Grammar", done: 2, total: 10 }]);
  });
});
