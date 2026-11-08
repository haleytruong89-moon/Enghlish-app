import { describe, expect, it } from "vitest";
import { computePointLevel } from "@/lib/engine/points/compute";
import { projectPointDecisions } from "@/lib/engine/points/project";
import { POINT_ENGINE_VERSION, type PointDecision, type PointEngineInput } from "@/lib/engine/points/types";

const PP01 = {
  developing: { minCorrect: 1 },
  independent: { minCounted: 4, minAccuracyPct: 75, minDistinctDays: 2 },
  transferable: { minCountedCorrect: 2, minDaysFromLastOccasion: 14, requiresDifferentSource: true },
  flag: { window: 3, minWrong: 2 },
  supportCapLevel: 2,
};
// Vietnamese day numbers for readability.
const D = (iso: string) => Math.floor((Date.parse(`${iso}T00:00:00+07:00`) + 7 * 3600_000) / 86_400_000);
const base = (over: Partial<PointEngineInput>): PointEngineInput => ({
  tagKey: "t", taughtUnit: false, counted: [], supportedCorrect: 0, supportedAttempted: 0, decisions: [],
  policy: { version: "PP-0.1", config: PP01 }, now: new Date("2026-12-31T00:00:00+07:00"), ...over,
});
const q = (day: string, correct: boolean, src = "PT", ref = `${src}:${day}:${correct}:${Math.random()}`) => ({ ref, day: D(day), correct, sourceId: src, first: true });
let seq = 0;
const dec = (kind: PointDecision["kind"], from: PointDecision["fromState"], to: PointDecision["toState"], extra: Partial<PointDecision> = {}): PointDecision => ({
  id: `d${++seq}`, seq, kind, fromState: from, toState: to, evidenceKey: null, respondsTo: null, createdAt: "2026-11-30T00:00:00Z", ...extra,
});

describe("computePointLevel (PP-0.1) — the five DOMAIN §5.2 examples", () => {
  it("1) Progress Test 23/10 tự làm rồi chữa, 5/5 passive, ONE occasion → level 2, nothing to propose", () => {
    const r = computePointLevel(base({ counted: [1, 2, 3, 4, 5].map((n) => q("2026-10-23", true, "PT", `PT:q${n}`)) }));
    expect(r.evidenceState).toBe("DEVELOPING");
    expect(r.auto).toBe("DEVELOPING");
    expect(r.propose).toBeNull();
  });

  it("2) + homework 05/11 4/5 → 10 counted, 90 %, 2 days → PROPOSE 'Tự làm được'", () => {
    const r = computePointLevel(base({
      counted: [
        ...[1, 2, 3, 4, 5].map((n) => q("2026-10-23", true, "PT", `PT:q${n}`)),
        ...[1, 2, 3, 4].map((n) => q("2026-11-05", true, "HW", `HW:q${n}`)),
        q("2026-11-05", false, "HW", "HW:q5"),
      ],
    }));
    expect(r.propose).toBe("INDEPENDENT");
    expect(r.auto).toBe("DEVELOPING");
    expect(r.proposeKey).toMatch(/^10-[0-9a-f]{16}$/);
  });

  it("3) 'get across': q50 wrong 23/10, suggested 25/11 right 3/3 → 4 counted, 75 %, 2 days → PROPOSE 'Tự làm được'", () => {
    const r = computePointLevel(base({
      counted: [q("2026-10-23", false, "PT", "PT:q50"), q("2026-11-25", true, "SG", "SG:q1"), q("2026-11-25", true, "SG", "SG:q2"), q("2026-11-25", true, "SG", "SG:q3")],
    }));
    expect(r.propose).toBe("INDEPENDENT");
  });

  it("4) one session done WITH the tutor, 6/6 → level 2 only (help never counts for level 3)", () => {
    const r = computePointLevel(base({ counted: [], supportedCorrect: 6, supportedAttempted: 6 }));
    expect(r.evidenceState).toBe("DEVELOPING");
    expect(r.propose).toBeNull();
    expect(r.auto).toBe("DEVELOPING");
  });

  it("5) at level 3, review 10/12 wrong 2 of the last 3 → the level stays, ⚑ is raised, nothing is lowered", () => {
    const decisions = [dec("CONFIRMED", "DEVELOPING", "INDEPENDENT", { respondsTo: "p0" })];
    const r = computePointLevel(base({
      decisions,
      counted: [
        q("2026-11-10", true, "A", "A:q1"), q("2026-11-10", true, "A", "A:q2"), q("2026-11-10", true, "A", "A:q3"), q("2026-11-10", true, "A", "A:q4"),
        q("2026-12-12", false, "B", "B:q1"), q("2026-12-12", false, "B", "B:q2"), q("2026-12-12", true, "B", "B:q3"),
      ],
    }));
    expect(r.currentState).toBe("INDEPENDENT");
    expect(r.proposedState).toBe("INDEPENDENT"); // never downgrade
    expect(r.auto).toBeNull();
    expect(r.raiseFlag).toBe(true);
  });
});

describe("level 1, level 4, never lowering, dedup, hold", () => {
  it("level 1: a taught Unit or a wrong answer is enough; nothing at all is 'not observed'", () => {
    expect(computePointLevel(base({})).evidenceState).toBe("NOT_OBSERVED");
    expect(computePointLevel(base({ taughtUnit: true })).auto).toBe("SUPPORTED");
    expect(computePointLevel(base({ counted: [q("2026-10-23", false)] })).evidenceState).toBe("SUPPORTED");
    expect(computePointLevel(base({ supportedAttempted: 2 })).evidenceState).toBe("SUPPORTED");
    expect(POINT_ENGINE_VERSION).toBe("PP-eng-1");
  });

  it("75 % is exact: 3 of 4 passes, 5 of 7 does not", () => {
    const days = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
    const pass = computePointLevel(base({ counted: [...days.slice(0, 3).map((d) => q(d, true)), q(days[3]!, false)] }));
    expect(pass.propose).toBe("INDEPENDENT");
    const fail = computePointLevel(base({ counted: [...Array.from({ length: 5 }, (_, i) => q(`2026-10-0${i + 1}`, true)), q("2026-10-07", false), q("2026-10-08", false)] }));
    expect(fail.propose).toBeNull();
    expect(fail.evidenceState).toBe("DEVELOPING");
  });

  it("level 4 (H2): from 'Tự làm được', 2 correct on a new source 14 days after the last occasion → propose 'Vận dụng được'", () => {
    const decisions = [dec("CONFIRMED", "DEVELOPING", "INDEPENDENT", { respondsTo: "p0" })];
    const counted = [q("2026-10-01", true, "A"), q("2026-10-01", true, "A"), q("2026-10-05", true, "A"), q("2026-10-05", true, "A"), q("2026-10-19", true, "B"), q("2026-10-19", true, "B")];
    expect(computePointLevel(base({ decisions, counted })).propose).toBe("TRANSFERABLE");
    // 13 days is not enough
    const early = [...counted.slice(0, 4), q("2026-10-18", true, "B"), q("2026-10-18", true, "B")];
    expect(computePointLevel(base({ decisions, counted: early })).propose).toBeNull();
    // the same source is not "another source"
    const same = [...counted.slice(0, 4), q("2026-10-19", true, "A"), q("2026-10-19", true, "A")];
    expect(computePointLevel(base({ decisions, counted: same })).propose).toBeNull();
  });

  it("evidence for level 4 while still at level 2 proposes level 3 first (level 4 only from 'Tự làm được')", () => {
    const counted = [q("2026-10-01", true, "A"), q("2026-10-01", true, "A"), q("2026-10-05", true, "A"), q("2026-10-05", true, "A"), q("2026-10-19", true, "B"), q("2026-10-19", true, "B")];
    const r = computePointLevel(base({ counted }));
    expect(r.evidenceState).toBe("TRANSFERABLE");
    expect(r.propose).toBe("INDEPENDENT");
  });

  it("an open proposal blocks another; the same (level, evidence) is never proposed twice; a 'Chưa' stays answered", () => {
    const counted = [1, 2, 3, 4].map((n) => q(`2026-10-0${n}`, true, "A", `A:${n}`));
    const first = computePointLevel(base({ counted }));
    expect(first.propose).toBe("INDEPENDENT");
    const proposed = dec("PROPOSED", "DEVELOPING", "INDEPENDENT", { evidenceKey: first.proposeKey });
    expect(computePointLevel(base({ counted, decisions: [dec("AUTO", "NOT_OBSERVED", "DEVELOPING", { evidenceKey: "x" }), proposed] })).propose).toBeNull();
    const rejected = dec("REJECTED", "DEVELOPING", "DEVELOPING", { respondsTo: proposed.id });
    expect(computePointLevel(base({ counted, decisions: [dec("AUTO", "NOT_OBSERVED", "DEVELOPING", { evidenceKey: "x" }), proposed, rejected] })).propose).toBeNull();
    // one more counted question is new evidence
    const more = [...counted, q("2026-10-09", true, "A", "A:9")];
    expect(computePointLevel(base({ counted: more, decisions: [dec("AUTO", "NOT_OBSERVED", "DEVELOPING", { evidenceKey: "x" }), proposed, rejected] })).propose).toBe("INDEPENDENT");
  });

  it("a level the tutor set by hand stands until the evidence changes (B2)", () => {
    const counted = [q("2026-10-01", true, "A", "A:1")];
    const key = computePointLevel(base({ counted })).evidenceKey;
    expect(computePointLevel(base({ counted })).auto).toBe("DEVELOPING");
    const manual = dec("MANUAL", "DEVELOPING", "SUPPORTED", { evidenceKey: key });
    const held = computePointLevel(base({ counted, decisions: [manual] }));
    expect(held.currentState).toBe("SUPPORTED");
    expect(held.auto).toBeNull();
    expect(held.propose).toBeNull();
    const newer = computePointLevel(base({ counted: [...counted, q("2026-10-02", true, "A", "A:2")], decisions: [manual] }));
    expect(newer.auto).toBe("DEVELOPING");
  });

  it("⚑ is raised once per evidence, never below level 3, never when one is open", () => {
    const confirmed = dec("CONFIRMED", "DEVELOPING", "INDEPENDENT", { respondsTo: "p0" });
    const bad = [q("2026-12-01", false, "A", "A:1"), q("2026-12-02", false, "A", "A:2"), q("2026-12-03", true, "A", "A:3")];
    const r = computePointLevel(base({ decisions: [confirmed], counted: bad }));
    expect(r.raiseFlag).toBe(true);
    const flag = dec("FLAG", "INDEPENDENT", "INDEPENDENT", { evidenceKey: r.flag.key });
    expect(computePointLevel(base({ decisions: [confirmed, flag], counted: bad })).raiseFlag).toBe(false);
    const kept = dec("CONFIRMED", "INDEPENDENT", "INDEPENDENT", { respondsTo: flag.id });
    expect(computePointLevel(base({ decisions: [confirmed, flag, kept], counted: bad })).raiseFlag).toBe(false);
    expect(computePointLevel(base({ counted: bad })).raiseFlag).toBe(false); // level < 3
  });

  it("projectPointDecisions follows the book: latest AUTO / CONFIRMED / MANUAL is the state; unanswered PROPOSED / FLAG are open", () => {
    const a = dec("AUTO", "NOT_OBSERVED", "DEVELOPING", { evidenceKey: "1-a" });
    const p = dec("PROPOSED", "DEVELOPING", "INDEPENDENT", { evidenceKey: "4-b" });
    const proj = projectPointDecisions([p, a]);
    expect(proj.state).toBe("DEVELOPING");
    expect(proj.openProposal?.id).toBe(p.id);
    expect(projectPointDecisions([a, p, dec("CONFIRMED", "DEVELOPING", "INDEPENDENT", { respondsTo: p.id })]).state).toBe("INDEPENDENT");
  });
});
