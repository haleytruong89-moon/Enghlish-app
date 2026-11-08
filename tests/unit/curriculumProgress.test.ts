import { describe, expect, it } from "vitest";
import { curriculumProgress, proposeInProgress, type ProgressUnit, type UnitEventRow } from "@/lib/curriculum/progress";

/** Exactly the three examples of docs/DOMAIN.md §5.1. */
const units = (codes: number[]): ProgressUnit[] => codes.map((n, i) => ({ code: `U${n}`, ord: i + 1, title: `Unit ${n}`, skipped: false }));
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
let seq = 0;
const ev = (code: string, status: UnitEventRow["status"]): UnitEventRow => {
  seq += 1;
  return { unitCode: code, status, at: `2026-11-${String(1 + Math.floor(seq / 10)).padStart(2, "0")}T0${seq % 10}:00:00.000Z`, id: `e${String(seq).padStart(3, "0")}` };
};
/** U1–U12 done (in order), then U3 skipped, then U13 in progress. */
const destinationEvents = () => [...range(1, 12).map((n) => ev(`U${n}`, "done")), ev("U3", "skipped"), ev("U13", "in_progress")];

describe("đang học đến + độ phủ (DOMAIN §5.1)", () => {
  it("Destination 26 Unit; U1–U12 done, U13 in progress, U3 skipped → U13; 11/25 = 44 %", () => {
    const p = curriculumProgress(units(range(1, 26)), destinationEvents());
    expect(p.current?.code).toBe("U13");
    expect([p.done, p.total, p.pct]).toEqual([11, 25, 44]);
    expect(p.statusOf.U3).toBe("skipped");
  });

  it("Reading Explorer 3: nothing marked → not started; 0 %", () => {
    const p = curriculumProgress(units(range(1, 12)), []);
    expect(p.current).toBeNull();
    expect([p.done, p.pct]).toEqual([0, 0]);
  });

  it("v2 drops U20 (not studied) and adds U27 → still U13 (stable codes); coverage recomputed on v2", () => {
    const events = destinationEvents();
    const v2 = units([...range(1, 19), ...range(21, 27)]);
    const p = curriculumProgress(v2, events);
    expect(p.current?.code).toBe("U13");
    expect(v2.map((u) => u.code)).not.toContain("U20");
    expect(p.statusOf.U27).toBe("not_started");
    expect([p.done, p.total, p.pct]).toEqual([11, 25, 44]);
  });

  it("the session note proposes 'Đang học' only for chosen units that have not started", () => {
    const p = curriculumProgress(units(range(1, 26)), destinationEvents());
    expect(proposeInProgress(["U12", "U13", "U14"], p.statusOf)).toEqual(["U14"]);
  });
});
