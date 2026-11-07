import { describe, expect, it } from "vitest";
import { applySameAsLast } from "@/lib/tutorwork/sameAsLast";

const none = { practised: [] as string[], weak: [] as string[] };

describe("applySameAsLast", () => {
  const prev = { practisedTargetIds: ["a", "b", "gone"], weakTagKeys: ["t1", "t2", "t3", "t4", "x"] };
  it("adds available items, caps weak points at 3, reports what was skipped", () => {
    const r = applySameAsLast(prev, none, ["a", "b", "c"], ["t1", "t2", "t3", "t4"]);
    expect(r.practised).toEqual(["a", "b"]);
    expect(r.weak).toEqual(["t1", "t2", "t3"]);
    expect([r.addedSkills, r.addedWeak]).toEqual([2, 3]);
    expect(r.skippedSkills).toBe(1);
    expect(r.skippedWeak).toBe(2); // x unavailable, t4 over the cap
  });
  it("keeps the current picks first and adds the previous ones, without duplicates", () => {
    const r = applySameAsLast({ practisedTargetIds: ["a", "b"], weakTagKeys: ["t1", "t2"] }, { practised: ["c", "a"], weak: ["t2"] }, ["a", "b", "c"], ["t1", "t2"]);
    expect(r.practised).toEqual(["c", "a", "b"]);
    expect(r.weak).toEqual(["t2", "t1"]);
    expect([r.addedSkills, r.addedWeak, r.skippedSkills, r.skippedWeak]).toEqual([1, 1, 0, 0]);
  });
  it("caps weak points counting the current picks", () => {
    const r = applySameAsLast({ practisedTargetIds: [], weakTagKeys: ["t1", "t2", "t3"] }, { practised: [], weak: ["t9", "t8"] }, [], ["t1", "t2", "t3", "t8", "t9"]);
    expect(r.weak).toEqual(["t9", "t8", "t1"]);
    expect([r.addedWeak, r.skippedWeak]).toEqual([1, 2]);
  });
  it("caps skills at the explicit maximum", () => {
    const r = applySameAsLast({ practisedTargetIds: ["a", "b", "c"], weakTagKeys: [] }, { practised: ["z"], weak: [] }, ["a", "b", "c", "z"], [], [], { maxPractised: 3 });
    expect(r.practised).toEqual(["z", "a", "b"]);
    expect([r.addedSkills, r.skippedSkills]).toEqual([2, 1]);
  });
  it("a tag hidden in the picker is skipped, unless it is already chosen", () => {
    const r = applySameAsLast({ practisedTargetIds: [], weakTagKeys: ["h", "t1"] }, { practised: [], weak: [] }, [], ["h", "t1"], ["h"]);
    expect(r.weak).toEqual(["t1"]);
    expect(r.skippedWeak).toBe(1);
    const kept = applySameAsLast({ practisedTargetIds: [], weakTagKeys: ["h"] }, { practised: [], weak: ["h"] }, [], ["h"], ["h"]);
    expect(kept.weak).toEqual(["h"]);
    expect([kept.addedWeak, kept.skippedWeak]).toEqual([0, 0]);
  });
  it("nothing to add: unavailable or already chosen items add nothing (the button hides)", () => {
    const unavailable = applySameAsLast(prev, none, [], []);
    expect(unavailable).toMatchObject({ practised: [], weak: [], addedSkills: 0, addedWeak: 0, skippedSkills: 3, skippedWeak: 5 });
    const chosen = applySameAsLast({ practisedTargetIds: ["a"], weakTagKeys: ["t1"] }, { practised: ["a"], weak: ["t1"] }, ["a"], ["t1"]);
    expect(chosen.addedSkills + chosen.addedWeak).toBe(0);
  });
});
