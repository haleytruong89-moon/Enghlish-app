import { describe, expect, it } from "vitest";
import { daysSinceLastPractice, vnDay } from "@/lib/engine/days";
import { evidenceKeyOf } from "@/lib/engine/key";
import { projectDecisions } from "@/lib/engine/project";
import { ENGINE_VERSION, SKILL_STATES, STATE_LEVEL, stateAt } from "@/lib/engine/types";
import { decision, exposure } from "./fixtures/engine";

describe("engine types", () => {
  it("5 states in order, levels 0..4, stateAt clamps", () => {
    expect(SKILL_STATES).toEqual(["NOT_OBSERVED", "SUPPORTED", "DEVELOPING", "INDEPENDENT", "TRANSFERABLE"]);
    expect(SKILL_STATES.map((s) => STATE_LEVEL[s])).toEqual([0, 1, 2, 3, 4]);
    expect([stateAt(-1), stateAt(2), stateAt(9)]).toEqual(["NOT_OBSERVED", "DEVELOPING", "TRANSFERABLE"]);
    expect(ENGINE_VERSION).toMatch(/^[A-Za-z0-9][A-Za-z0-9.-]{0,19}$/); // same CHECK as mastery_decisions.engine_version
  });
});

describe("evidenceKeyOf (D13)", () => {
  it("is order-free and duplicate-free, has the SQL format, and changes when one id is added", () => {
    expect(evidenceKeyOf([])).toBe("0-cbf29ce484222325"); // FNV-1a 64 offset basis
    expect(evidenceKeyOf(["a"])).toBe("1-af63dc4c8601ec8c"); // FNV-1a 64 test vector of "a"
    expect(evidenceKeyOf(["b", "a", "a"])).toBe(evidenceKeyOf(["a", "b"]));
    expect(evidenceKeyOf(["a", "b", "c"])).not.toBe(evidenceKeyOf(["a", "b"]));
    expect(evidenceKeyOf(["x".repeat(500)])).toMatch(/^[0-9]{1,6}-[0-9a-f]{16}$/);
  });
});

describe("Vietnamese days (D7) and the delayed-check gap (D8)", () => {
  it("vnDay changes at midnight in Vietnam, not in UTC", () => {
    expect(vnDay("2026-10-22T16:59:59Z")).toBe(vnDay("2026-10-22T00:00:00Z")); // 23:59:59 on 22/10 in Vietnam
    expect(vnDay("2026-10-22T17:00:00Z")).toBe(vnDay("2026-10-22T00:00:00Z") + 1); // 00:00 on 23/10 in Vietnam
  });

  it("counts from the latest practice of the same topic before the work, ignoring the work's own exposure", () => {
    const at = exposure(3).at;
    expect(daysSinceLastPractice([exposure(20), exposure(17), exposure(3, "A-W1-VOLCANOES", "self")], at, "self", "A-W1-VOLCANOES")).toBe(14);
    expect(daysSinceLastPractice([exposure(20), exposure(1)], at, "self", "A-W1-VOLCANOES")).toBe(17); // later practice is not "before"
  });

  it("a lesson (no topic) counts for every topic; another topic counts only when the topic itself has no practice; none → null", () => {
    const at = exposure(3).at;
    expect(daysSinceLastPractice([exposure(20), exposure(10, null)], at, "x", "A-W1-VOLCANOES")).toBe(7);
    expect(daysSinceLastPractice([exposure(20), exposure(5, "A-W2-WATERCYCLE")], at, "x", "A-W1-VOLCANOES")).toBe(17);
    expect(daysSinceLastPractice([exposure(9, "A-W2-WATERCYCLE")], at, "x", "A-W1-VOLCANOES")).toBe(6);
    expect(daysSinceLastPractice([exposure(9, "A-W2-WATERCYCLE")], at, "x", null)).toBe(6); // route 2: any topic
    expect(daysSinceLastPractice([], at, "x", "A-W1-VOLCANOES")).toBeNull();
  });
});

describe("projectDecisions (mirror of english.eng_project_skill_state)", () => {
  it("no decision → Chưa đủ bài, nothing open", () => {
    expect(projectDecisions([])).toMatchObject({ state: "NOT_OBSERVED", stateSince: null, stateDecisionId: null, openProposal: null, openFlag: null });
  });

  it("the state is the latest AUTO / CONFIRMED / MANUAL by seq (not by array order); REJECTED and PROPOSED never set it", () => {
    const a1 = decision("AUTO", "SUPPORTED", { daysAgo: 20 });
    const a2 = decision("AUTO", "DEVELOPING", { daysAgo: 15 });
    const p = decision("PROPOSED", "INDEPENDENT", { daysAgo: 10 });
    const r = decision("REJECTED", "DEVELOPING", { daysAgo: 9, respondsTo: p.id });
    const proj = projectDecisions([r, p, a2, a1]);
    expect(proj).toMatchObject({ state: "DEVELOPING", stateSince: a2.createdAt, stateDecisionId: a2.id, openProposal: null });
    expect([...proj.proposalKeys]).toEqual([p.evidenceKey]);
  });

  it("an unanswered PROPOSED / FLAG is open; CONFIRMED of a proposal moves the state; CONFIRMED of a ⚑ keeps it but restarts stateSince", () => {
    const a = decision("AUTO", "DEVELOPING", { daysAgo: 20 });
    const p = decision("PROPOSED", "INDEPENDENT", { daysAgo: 10 });
    const f = decision("FLAG", "DEVELOPING", { daysAgo: 8, fromState: "DEVELOPING" });
    expect(projectDecisions([a, p, f])).toMatchObject({ state: "DEVELOPING", openProposal: { id: p.id }, openFlag: { id: f.id } });
    const keep = decision("CONFIRMED", "DEVELOPING", { daysAgo: 7, respondsTo: f.id, fromState: "DEVELOPING" });
    const yes = decision("CONFIRMED", "INDEPENDENT", { daysAgo: 6, respondsTo: p.id, fromState: "DEVELOPING" });
    const after = projectDecisions([a, p, f, keep, yes]);
    expect(after).toMatchObject({ state: "INDEPENDENT", stateSince: yes.createdAt, openProposal: null, openFlag: null });
    expect([...after.flagKeys]).toEqual([f.evidenceKey]);
    expect(projectDecisions([a, f, keep]).stateSince).toBe(keep.createdAt);
  });

  it("a MANUAL after a confirmed level wins (a person may correct it, G3)", () => {
    const c = decision("CONFIRMED", "INDEPENDENT", { daysAgo: 10, respondsTo: "md-x" });
    const m = decision("MANUAL", "DEVELOPING", { daysAgo: 2, fromState: "INDEPENDENT" });
    expect(projectDecisions([m, c]).state).toBe("DEVELOPING");
  });
});

// (Task 3 adds the computeTargetState tests below this line)
