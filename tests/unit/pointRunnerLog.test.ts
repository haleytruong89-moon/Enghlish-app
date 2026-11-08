import { describe, expect, it, vi } from "vitest";
import { makePointHook, recomputePoints, type PointEngineStore } from "@/lib/engine/points/runner";

const inputs = {
  learner_id: "00000000-0000-4000-8000-000000000001",
  now: "2026-11-08T00:00:00Z",
  policy: {
    version: "PP-0.1",
    config: {
      developing: { minCorrect: 1 },
      independent: { minCounted: 4, minAccuracyPct: 75, minDistinctDays: 2 },
      transferable: { minCountedCorrect: 2, minDaysFromLastOccasion: 14, requiresDifferentSource: true },
      flag: { window: 3, minWrong: 2 },
      supportCapLevel: 2,
    },
  },
  points: [],
};

describe("point runner: failed points are logged", () => {
  const store = (applied: unknown, withPoint = true): PointEngineStore => ({
    loadInputs: async () => (withPoint ? { ...inputs, points: [{ tag_key: "cum-dong-tu", title_vi: null, group_key: null, taught_unit: false, counted: [], supported_correct: 0, supported_attempted: 0, decisions: [] }] } : inputs),
    applyResults: async () => applied,
    resetStates: async () => ({}),
  });
  const bad = { auto: 0, proposed: 0, flagged: 0, failed: 1, failed_keys: [{ tag_key: "cum-dong-tu", sqlstate: "23505", message: "boom" }], policy_version: "PP-0.1" };

  it("calls onFailed with the tag, sqlstate and message when the database skipped a point", async () => {
    const onFailed = vi.fn(async () => {});
    const r = await recomputePoints(store(bad), "L", null, onFailed);
    expect(r.applied.failedKeys).toEqual([{ tagKey: "cum-dong-tu", sqlstate: "23505", message: "boom" }]);
    expect(onFailed).toHaveBeenCalledTimes(1);
    expect((onFailed.mock.calls[0] as unknown as [Error])[0].message).toBe("point_apply_failed 1 (cum-dong-tu:23505:boom)");
  });
  it("stays quiet when nothing failed", async () => {
    const onFailed = vi.fn(async () => {});
    await recomputePoints(store({ ...bad, failed: 0, failed_keys: [] }), "L", null, onFailed);
    expect(onFailed).not.toHaveBeenCalled();
  });
  it("the hook logs it, and an old database without failed_keys still parses", async () => {
    const log = vi.fn(async () => {});
    await makePointHook(() => store(bad), log, () => false)("L", null);
    expect(log).toHaveBeenCalledTimes(1);
    const r = await recomputePoints(store({ auto: 0, proposed: 0, flagged: 0, policy_version: "PP-0.1" }), "L");
    expect(r.applied.failedKeys).toEqual([]);
  });
});
