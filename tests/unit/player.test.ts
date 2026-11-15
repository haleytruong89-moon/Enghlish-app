import { describe, expect, it } from "vitest";
import {
  answeredIds, clampIndex, dots, initialSaveFlow, isLast, nextIndex, onEdit, onSaveDone, onSaveStart, prevIndex, progress, saveLabel, shouldSave, startIndex, unansweredIndexes,
} from "@/lib/student/player";

const items = ["q1", "q2", "q3", "q4"].map((id) => ({ id }));

describe("player · moving between questions", () => {
  it("never leaves the step", () => {
    expect(nextIndex(3, 4)).toBe(3);
    expect(prevIndex(0, 4)).toBe(0);
    expect(clampIndex(99, 4)).toBe(3);
    expect(clampIndex(-5, 4)).toBe(0);
    expect(clampIndex(Number.NaN, 4)).toBe(0);
    expect(clampIndex(2, 0)).toBe(0);
    expect(isLast(3, 4)).toBe(true);
    expect(isLast(2, 4)).toBe(false);
    expect(isLast(0, 0)).toBe(false);
  });
  it("opens on the first question without an answer; all answered → the last", () => {
    expect(startIndex(items, {})).toBe(0);
    expect(startIndex(items, { q1: "a", q2: "b" })).toBe(2);
    expect(startIndex(items, { q1: "a", q3: "c" })).toBe(1);
    expect(startIndex(items, { q1: "a", q2: "b", q3: "c", q4: "d" })).toBe(3);
  });
});

describe("player · answered counts (only the child's own work, never right / wrong)", () => {
  it("blank and spaces are not answers; answers of unknown ids are ignored", () => {
    const a = { q1: "x", q2: "   ", q3: "", q9: "stray" };
    expect(answeredIds(items, a)).toEqual(["q1"]);
    expect(progress(items, a)).toEqual({ answered: 1, total: 4 });
    expect(unansweredIndexes(items, a)).toEqual([1, 2, 3]);
  });
  it("dots mark answered / empty and the current one", () => {
    expect(dots(items, { q2: "b" }, 1)).toEqual([
      { id: "q1", state: "empty", current: false },
      { id: "q2", state: "answered", current: true },
      { id: "q3", state: "empty", current: false },
      { id: "q4", state: "empty", current: false },
    ]);
  });
});

describe("player · autosave merges edits", () => {
  it("many edits during one save become exactly one more save", () => {
    let s = initialSaveFlow(false);
    expect(saveLabel(s)).toBe("none");
    expect(shouldSave(s)).toBe(false);
    s = onEdit(s);
    expect(shouldSave(s)).toBe(true);
    s = onSaveStart(s);
    expect(saveLabel(s)).toBe("saving");
    s = onEdit(onEdit(onEdit(s))); // typing while the save runs
    expect(shouldSave(s)).toBe(false); // waits for the running one
    s = onSaveDone(s, true);
    expect(shouldSave(s)).toBe(true); // ONE more save carries all of it
    s = onSaveDone(onSaveStart(s), true);
    expect(shouldSave(s)).toBe(false);
    expect(saveLabel(s)).toBe("saved");
  });
  it("a failed save says so and tries again; the next success clears it", () => {
    let s = onSaveStart(onEdit(initialSaveFlow(true)));
    s = onSaveDone(s, false);
    expect(saveLabel(s)).toBe("error");
    expect(shouldSave(s)).toBe(true);
    s = onSaveDone(onSaveStart(s), true);
    expect(saveLabel(s)).toBe("saved");
  });
  it("a draft that existed before shows 'saved' straight away", () => {
    expect(saveLabel(initialSaveFlow(true))).toBe("saved");
  });
});

describe("player · the 'saved' label never claims more than is stored", () => {
  it("a change made after the last stored copy shows 'saving' (not 'saved'), also while no save is running", () => {
    let s = onSaveDone(onSaveStart(onEdit(initialSaveFlow(false))), true);
    expect(saveLabel(s)).toBe("saved");
    s = onEdit(s); // typed after the save finished, before the next one starts
    expect(saveLabel(s)).toBe("saving");
    s = onSaveStart(onEdit(onSaveStart(onEdit(initialSaveFlow(false))))); // edit during a running save
    s = onSaveDone(s, true);
    expect(s.dirty).toBe(false);
  });
  it("an edit made while a save runs keeps the flow dirty when that save ends", () => {
    let s = onSaveStart(onEdit(initialSaveFlow(false)));
    s = onEdit(s);
    s = onSaveDone(s, true);
    expect(s.dirty).toBe(true);
    expect(saveLabel(s)).toBe("saving");
    expect(shouldSave(s)).toBe(true);
  });
});
