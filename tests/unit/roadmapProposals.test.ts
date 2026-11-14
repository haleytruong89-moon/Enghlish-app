import { describe, expect, it } from "vitest";
import { buildProposals, normalizeName, parseDue } from "@/lib/roadmap/proposals";

const row = (code: string, page: number) => ({
  code, title: `Unit ${code}`, section: null, page, skipped: false, points: [], missing_points: [], needs_review: false, review_reason: null,
  flags: [], origin: "manual", ai_index: null, dropped: false, edit_reason: null,
});
const payload = {
  units: [row("U1", 4), row("U2", 12), row("U3", 20), row("U4", 28), row("U5", 36)],
  ignored: [
    { label: "Progress Test 1", page: 30, reason: "test" },
    { label: "Review A", page: 14, reason: "review" },
    { label: "Reference", page: 90, reason: "reference" },
  ],
};
const curriculum = { id: "11111111-1111-1111-1111-111111111111", payload, units: payload.units.map((u, i) => ({ code: u.code, ord: i + 1 })) };
const base = { trackId: "B", curriculum, intakeGoals: [], trackGoalLabel: null, usedKeys: new Set<string>() };

describe("buildProposals", () => {
  it("a Progress Test becomes a flag after the highest-order Unit it revises", () => {
    const p = buildProposals(base);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ kind: "progress_test", role: "flag", title: "Progress Test 1", afterUnit: "U4", curriculumId: curriculum.id, source: "progress_test" });
    expect(p[0]?.key).toBe(`pt:${curriculum.id}:progress-test-1`);
  });
  it("intake goals: first = summit, the others and the track goal come after it; dates are read", () => {
    const p = buildProposals({
      ...base, curriculum: null, trackGoalLabel: "Lên C1",
      intakeGoals: [{ title: "Vào chuyên Anh", due: "06/2027" }, { title: "IELTS 6.5", due: "~10/2027" }, { title: "Đọc sách gốc", due: "sau hè" }],
    });
    expect(p.map((x) => [x.title, x.role, x.targetMonth, x.approx])).toEqual([
      ["Vào chuyên Anh", "summit", "2027-06-01", false],
      ["IELTS 6.5", "beyond", "2027-10-01", true],
      ["Đọc sách gốc", "beyond", null, false],
      ["Lên C1", "beyond", null, false],
    ]);
  });
  it("without intake goals the goal of the track is the summit", () => {
    const p = buildProposals({ ...base, curriculum: null, trackGoalLabel: "Lên B1" });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ role: "summit", title: "Lên B1", source: "track", key: "track:b" });
  });
  it("a proposal whose key is used (any status) is hidden", () => {
    const first = buildProposals({ ...base, trackGoalLabel: "Lên C1" });
    const used = new Set(first.map((x) => x.key));
    expect(buildProposals({ ...base, trackGoalLabel: "Lên C1", usedKeys: used })).toEqual([]);
  });
  it("keys are stable and match the stored key format", () => {
    const keys = buildProposals({ ...base, trackGoalLabel: "Lên C1", intakeGoals: [{ title: "Đỗ chuyên Anh – 2027!" }] }).map((p) => p.key);
    expect(keys).toEqual(buildProposals({ ...base, trackGoalLabel: "Lên C1", intakeGoals: [{ title: "Đỗ chuyên Anh – 2027!" }] }).map((p) => p.key));
    for (const k of keys) expect(k).toMatch(/^(pt|goal|track):[a-z0-9:_-]{1,140}$/);
  });
  it("normalizeName / parseDue", () => {
    expect(normalizeName("  Kiểm tra tiến độ Đợt 1 ")).toBe("kiem-tra-tien-do-dot-1");
    expect(normalizeName("!!!")).toBe("untitled");
    expect(parseDue("06/2027")).toEqual({ month: "2027-06-01", approx: false });
    expect(parseDue("~10/2027")).toEqual({ month: "2027-10-01", approx: true });
    expect(parseDue("13/2027").month).toBeNull();
    expect(parseDue("quý 3").month).toBeNull();
    expect(parseDue(undefined).month).toBeNull();
  });
  it("is data-driven: no branch on the track id (same input, same output for any track)", () => {
    const a = buildProposals({ ...base, trackId: "A", curriculum: null, trackGoalLabel: "Lên B1" });
    const b = buildProposals({ ...base, trackId: "B", curriculum: null, trackGoalLabel: "Lên B1" });
    expect(a.map((x) => x.title)).toEqual(b.map((x) => x.title));
  });
  it("a bad payload gives no Progress Test proposals but does not throw", () => {
    expect(buildProposals({ ...base, curriculum: { ...curriculum, payload: { nope: 1 } } })).toEqual([]);
  });
});

describe("buildProposals when a summit already exists", () => {
  it("proposes `beyond` instead of a second summit (intake goal and track goal)", () => {
    const p = buildProposals({ ...base, curriculum: null, trackGoalLabel: "Lên C1", intakeGoals: [{ title: "Vào chuyên Anh" }], summitExists: true });
    expect(p.map((x) => [x.title, x.role])).toEqual([["Vào chuyên Anh", "beyond"], ["Lên C1", "beyond"]]);
  });
  it("the goal of the track alone is `beyond` too", () => {
    expect(buildProposals({ ...base, curriculum: null, trackGoalLabel: "Lên B1", summitExists: true })[0]?.role).toBe("beyond");
  });
  it("without a summit nothing changes", () => {
    expect(buildProposals({ ...base, curriculum: null, trackGoalLabel: "Lên B1", summitExists: false })[0]?.role).toBe("summit");
  });
});
