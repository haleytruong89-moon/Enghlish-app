import { describe, expect, it } from "vitest";
import type { RoadmapCurriculum } from "@/lib/roadmap/shape";
import { buildStrip } from "@/lib/roadmap/strip";
import type { MilestoneVersion } from "@/lib/roadmap/types";
import { buildCards } from "@/lib/roadmap/visible";

const cur: RoadmapCurriculum = {
  id: "c1", title: "Destination B2",
  units: [1, 2, 3, 4].map((n) => ({ code: `U${n}`, ord: n, title: `Unit ${n}`, skipped: n === 4 })),
  unitStates: { U1: "done", U2: "in_progress", U3: "not_started", U4: "skipped" },
};
const v = (over: Partial<MilestoneVersion>): MilestoneVersion => ({
  id: "r", milestoneId: "m", version: 1, kind: "progress_test", role: "flag", title: "PT1", curriculumId: "c1", afterUnit: "U2", targetMonth: null, approx: false,
  status: "confirmed", reason: null, proposalKey: null, createdAt: "2026-11-10T00:00:00Z", ...over,
});

describe("buildStrip", () => {
  it("units by state in order, flags at their Unit (confirmed solid, draft dashed), the summit last", () => {
    const cards = buildCards([
      v({ id: "r1", milestoneId: "m1" }),
      v({ id: "r2", milestoneId: "m2", title: "Thi thử", afterUnit: "U3", status: "draft" }),
      v({ id: "r3", milestoneId: "m3", role: "summit", kind: "goal", title: "Lên C1", curriculumId: null, afterUnit: null }),
    ]);
    const s = buildStrip("c1", [cur], cards)!;
    expect(s.cells.map((c) => [c.code, c.state])).toEqual([["U1", "done"], ["U2", "in_progress"], ["U3", "not_started"], ["U4", "skipped"]]);
    expect(s.cells[1]?.flags).toEqual([{ milestoneId: "m1", kind: "progress_test", title: "PT1", draft: false }]);
    expect(s.cells[2]?.flags[0]).toMatchObject({ title: "Thi thử", draft: true });
    expect(s.summit).toEqual({ title: "Lên C1", draft: false });
    expect(s.counts).toEqual({ done: 1, in_progress: 1, not_started: 1, skipped: 1 });
    expect(s.flagCount).toBe(2);
  });
  it("removed milestones are not drawn; a flag without a Unit is listed apart; a flag of another curriculum is not on this strip", () => {
    const cards = buildCards([
      v({ id: "r1", milestoneId: "m1", status: "removed", reason: "bỏ đề này" }),
      v({ id: "r2", milestoneId: "m2", title: "Chưa gắn", afterUnit: null, curriculumId: null }),
      v({ id: "r3", milestoneId: "m3", title: "Giáo trình khác", curriculumId: "c2", afterUnit: "U1" }),
    ]);
    const s = buildStrip("c1", [cur], cards)!;
    expect(s.cells.every((c) => c.flags.length === 0)).toBe(true);
    expect(s.unplaced.map((f) => f.title)).toEqual(["Chưa gắn"]);
    expect(s.flagCount).toBe(0);
  });
  it("no main curriculum → null; no summit → summit null", () => {
    expect(buildStrip(null, [cur], [])).toBeNull();
    expect(buildStrip("zzz", [cur], [])).toBeNull();
    expect(buildStrip("c1", [cur], [])!.summit).toBeNull();
  });
});
