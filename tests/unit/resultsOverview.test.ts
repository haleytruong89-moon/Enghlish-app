import { describe, expect, it } from "vitest";
import { buildOverview, CHART_MAX } from "@/lib/results/overview";
import type { TagAgg, WorkScore } from "@/lib/results/score";

const T = "2026-11-26";
const w = (id: string, day: string, correct: number, decided: number, over: Partial<WorkScore> = {}): WorkScore => ({
  instanceId: id, activityId: "a", title: `Unit 15 · ${id}`, units: [], submittedAt: `${day}T03:00:00Z`, attempts: 1, firstAttemptId: `f${id}`, lastAttemptId: null,
  episodeId: null, feedbackGiven: true, feedbackReady: true, official: null, counted: true, unitKey: "U15", tally: { correct, decided, pending: 0 }, parts: [], tags: [],
  waitingDays: 0, needsAdult: false, ...over,
});
const tag = (key: string, correct: number, decided: number): TagAgg => ({ key, tally: { correct, decided, pending: 0 }, works: 2, lastAt: "" });

describe("buildOverview", () => {
  const works = [
    w("a", "2026-11-25", 6, 10), w("b", "2026-11-10", 4, 10), // last 28 days: 10/20 = 50 %
    w("c", "2026-10-20", 2, 10), // the 28 days before: 20 %
    w("d", "2026-11-24", 9, 10, { counted: false }), // a test given again: never counted
    w("e", "2026-11-20", 0, 0, { needsAdult: true, waitingDays: 6, tally: { correct: 0, decided: 0, pending: 3 } }),
  ];
  it("4-week tiles: works sent, first-try % and its change, work waiting", () => {
    const o = buildOverview(works, [], null, T);
    expect(o.sent).toEqual({ now: 3, before: 1 });
    expect(o.firstTry).toEqual({ now: 50, before: 20, diff: 30 });
    expect(o.waiting).toEqual({ works: 1, oldestDays: 6 });
  });
  it("chart: counted works with a decided question, oldest → newest, at most CHART_MAX", () => {
    expect(buildOverview(works, [], null, T).points.map((p) => [p.instanceId, p.day, p.pct])).toEqual([["c", "2026-10-20", 20], ["b", "2026-11-10", 40], ["a", "2026-11-25", 60]]);
    const many = Array.from({ length: 25 }, (_, i) => w(`m${i}`, `2026-11-${String(1 + i).padStart(2, "0")}`, 1, 2));
    const pts = buildOverview(many, [], null, T).points;
    expect(pts).toHaveLength(CHART_MAX);
    expect(pts.at(-1)!.instanceId).toBe("m24");
  });
  it("nothing decided: unknown %, no change", () => {
    expect(buildOverview([], [], null, T).firstTry).toEqual({ now: null, before: null, diff: null });
    expect(buildOverview([], [], null, T).waiting).toEqual({ works: 0, oldestDays: null });
  });
  it("weakest 3 and strongest 3 among items with enough questions; never the same item twice", () => {
    const tags = [tag("t1", 2, 10), tag("t2", 4, 10), tag("t3", 5, 10), tag("t4", 10, 10), tag("t5", 8, 10), tag("few", 0, 2)];
    const o = buildOverview([], tags, null, T);
    expect(o.weakest.map((t) => t.key)).toEqual(["t1", "t2", "t3"]);
    expect(o.strongest.map((t) => t.key)).toEqual(["t4", "t5"]);
  });
});
