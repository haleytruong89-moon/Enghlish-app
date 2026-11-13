import { describe, expect, it } from "vitest";
import {
  autoTitle, derivedItems, emptyPicker, isReviewTicked, isUnitTicked, selectedUnits, stateFromCodes, toggleReview, toggleUnit, type UnitChoice,
} from "@/lib/curriculum/unitPicker";

const u = (n: number, points: string[] = []) => ({ kind: "unit" as const, code: `U${n}`, title: `Unit ${n}`, status: "not_started", points });
const DEST: UnitChoice = {
  curriculumId: "c1",
  title: "Destination C1 C2",
  units: [u(1, ["a"]), u(2, ["b"]), u(3, ["c", "d"]), u(4, ["d", "e"])],
  reviews: [
    { kind: "review", id: "r1", label: "Review 1", progressTest: false, related: ["U1", "U2"] },
    { kind: "review", id: "r2", label: "Review 2", progressTest: false, related: ["U3", "U4"] },
    { kind: "review", id: "r0", label: "Review 0", progressTest: false, related: [] },
  ],
};
const C = [DEST];

describe("unit picker (V10)", () => {
  it("ticking Review 2 ticks U3 and U4; unticking U4 unticks Review 2 and keeps U3", () => {
    let s = toggleReview(emptyPicker, C, "c1", "r2");
    expect(selectedUnits(C, s).map((x) => x.unit_code)).toEqual(["U3", "U4"]);
    expect(isReviewTicked(s, "c1", "r2")).toBe(true);
    s = toggleUnit(s, C, "c1", "U4");
    expect(isUnitTicked(s, "c1", "U4")).toBe(false);
    expect(isUnitTicked(s, "c1", "U3")).toBe(true);
    expect(isReviewTicked(s, "c1", "r2")).toBe(false);
  });
  it("unticking a Review row leaves its Units; unticking a Unit of another Review keeps this one", () => {
    let s = toggleReview(toggleReview(emptyPicker, C, "c1", "r1"), C, "c1", "r2");
    s = toggleUnit(s, C, "c1", "U1");
    expect(isReviewTicked(s, "c1", "r1")).toBe(false);
    expect(isReviewTicked(s, "c1", "r2")).toBe(true);
    s = toggleReview(s, C, "c1", "r2");
    expect(isUnitTicked(s, "c1", "U3")).toBe(true);
  });
  it("a Review row with no known Units only names the title", () => {
    const s = toggleReview(emptyPicker, C, "c1", "r0");
    expect(s.units).toEqual([]);
    expect(autoTitle(C, s)).toBe("Destination C1 C2 · Review 0");
  });
  it("autoTitle", () => {
    expect(autoTitle(C, emptyPicker)).toBe("");
    let s = toggleUnit(toggleUnit(emptyPicker, C, "c1", "U3"), C, "c1", "U4");
    expect(autoTitle(C, s)).toBe("Destination C1 C2 · Unit 3–4");
    s = toggleUnit(toggleUnit(emptyPicker, C, "c1", "U1"), C, "c1", "U4");
    expect(autoTitle(C, s)).toBe("Destination C1 C2 · Unit 1, 4");
    expect(autoTitle(C, toggleReview(emptyPicker, C, "c1", "r2"))).toBe("Destination C1 C2 · Review 2 (Unit 3–4)");
    const two: UnitChoice[] = [DEST, { ...DEST, curriculumId: "c2", title: "Reading 3" }];
    const both = toggleUnit(toggleUnit(emptyPicker, two, "c2", "U1"), two, "c1", "U2");
    expect(autoTitle(two, both)).toBe("Destination C1 C2 · Unit 2 + Reading 3 · Unit 1");
  });
  it("derivedItems: ticked order, no duplicates; selectedUnits in book order", () => {
    const s = toggleUnit(toggleUnit(emptyPicker, C, "c1", "U4"), C, "c1", "U3");
    expect(derivedItems(C, s)).toEqual(["d", "e", "c"]);
    expect(selectedUnits(C, s).map((x) => x.unit_code)).toEqual(["U3", "U4"]);
  });
  it("stateFromCodes ticks the known codes in the curriculum that has most of them", () => {
    const two: UnitChoice[] = [{ ...DEST, curriculumId: "c2", units: [u(1)] }, DEST];
    expect(stateFromCodes(two, ["U3", "U4", "U9"]).units).toEqual([{ curriculumId: "c1", code: "U3" }, { curriculumId: "c1", code: "U4" }]);
    expect(stateFromCodes(C, ["U9"])).toEqual(emptyPicker);
  });
});
