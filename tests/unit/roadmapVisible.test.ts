import { describe, expect, it } from "vitest";
import { buildCards, childVersion, draftCards, summitOf } from "@/lib/roadmap/visible";
import type { MilestoneVersion } from "@/lib/roadmap/types";

let seq = 0;
const v = (milestoneId: string, version: number, status: MilestoneVersion["status"], over: Partial<MilestoneVersion> = {}): MilestoneVersion => ({
  id: `row-${++seq}`, milestoneId, version, kind: "mock_exam", role: "flag", title: "Thi thử vào 10", curriculumId: "c1", afterUnit: "U18",
  targetMonth: "2027-03-01", approx: false, status, reason: status === "removed" ? "lịch thi đổi" : null, proposalKey: null,
  createdAt: `2026-11-${String(10 + version).padStart(2, "0")}T00:00:00Z`, ...over,
});

describe("what the child sees of a milestone (plan 3.4)", () => {
  it("v1 confirmed, v2 draft: the child still sees v1 and the tutor is told", () => {
    const rows = [v("m", 1, "confirmed"), v("m", 2, "draft", { afterUnit: "U20" })];
    expect(childVersion(rows)?.afterUnit).toBe("U18");
    const [card] = buildCards(rows);
    expect(card?.current.version).toBe(2);
    expect(card?.childSeesOlder).toBe(true);
    expect(card?.history.map((h) => h.version)).toEqual([2, 1]);
  });
  it("v3 removed: the child sees nothing, history keeps v1-v3", () => {
    const rows = [v("m", 3, "removed"), v("m", 1, "confirmed"), v("m", 2, "confirmed")];
    expect(childVersion(rows)).toBeNull();
    expect(buildCards(rows)[0]?.history).toHaveLength(3);
  });
  it("a draft that was never confirmed is invisible to the child", () => {
    expect(childVersion([v("m", 1, "draft")])).toBeNull();
    expect(childVersion([v("m", 1, "removed"), v("m", 2, "draft")])).toBeNull();
  });
  it("v1 confirmed, v2 removed, v3 draft: the child sees the latest confirmed before the draft", () => {
    expect(childVersion([v("m", 1, "confirmed"), v("m", 2, "removed"), v("m", 3, "draft")])?.version).toBe(1);
  });
  it("only the current version counts as waiting; one summit at most is returned", () => {
    const cards = buildCards([v("a", 1, "confirmed"), v("a", 2, "draft"), v("b", 1, "confirmed"), v("c", 1, "removed"), v("s", 1, "confirmed", { role: "summit", afterUnit: null, curriculumId: null })]);
    expect(draftCards(cards).map((c) => c.milestoneId)).toEqual(["a"]);
    expect(summitOf(cards)?.milestoneId).toBe("s");
  });
});
