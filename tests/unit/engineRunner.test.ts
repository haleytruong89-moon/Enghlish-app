import { describe, expect, it, vi } from "vitest";
import { evidenceKeyFor, isMissingFunction, makeEngineHook, rebuildLearner, recomputeLearner, type EngineStore } from "@/lib/engine/runner";
import { MAX_EVIDENCE, parseApplied, parseEngineInputs, sliceTarget, toApplyRow } from "@/lib/engine/shape";
import { ENGINE_VERSION, type EngineResult } from "@/lib/engine/types";
import { AP03 } from "./fixtures/engine";

/** What english.eng_engine_inputs returns (timestamps as Postgres writes them in jsonb: offset + microseconds). */
const raw = (o: Record<string, unknown> = {}) => ({
  learner_id: "L1",
  now: "2026-10-23T12:00:00.123456+07:00",
  policy: { version: "AP-0.3", config: AP03.config },
  targets: [{ key: "A-L3-CAUSE-W", domain: "writing" }, { key: "A-T1-TEXT-R", domain: "reading" }],
  episodes: [{
    episode_id: "ep1", attempt_id: "at1", activity_id: "act1", at: "2026-10-20T12:00:00.654321+07:00", context_id: "A-W1-VOLCANOES",
    is_first_attempt: true, mode: "INDEPENDENT_CHECK", observed_directly: false, transfer_marked: false,
    facets: { baseline: false, checkpoint: true, delayed_check: false, transfer_check: false }, declared_unknown: false,
    assistance: [{ kind: "notes", verification: "declared", targets: ["A-T1-TEXT-R"] }],
    scores: [
      { target_key: "A-L3-CAUSE-W", decision_id: "vd1", score: 3, not_observed: false },
      { target_key: "A-T1-TEXT-R", decision_id: "vd2", score: null, not_observed: true },
    ],
  }],
  auto: [{
    attempt_id: "aa1", episode_id: "ae1", activity_id: "act2", at: "2026-10-21T09:00:00+07:00", is_first_attempt: true, mode: "INDEPENDENT_CHECK",
    facets: {}, declared_unknown: false, assistance: [],
    items: [{ item_id: "q1", target_key: "A-T1-TEXT-R", result: "correct" }, { item_id: "q2", target_key: "A-L3-CAUSE-W", result: "incorrect" }],
  }],
  exposures: [
    { target_key: "A-L3-CAUSE-W", at: "2026-10-20T12:00:00+07:00", attempt_id: "at1", context_id: "A-W1-VOLCANOES" },
    { target_key: "A-T1-TEXT-R", at: "2026-10-19T12:00:00+07:00", attempt_id: null, context_id: null },
  ],
  decisions: [{
    id: "md1", seq: 5, target_key: "A-L3-CAUSE-W", kind: "AUTO", from_state: "NOT_OBSERVED", to_state: "SUPPORTED",
    evidence_key: "1-0000000000000000", responds_to: null, created_at: "2026-10-20T13:00:00.5+07:00",
  }],
  ...o,
});
const store = (over: Partial<EngineStore> = {}) => {
  const base = {
    loadInputs: vi.fn(async (): Promise<unknown> => raw()),
    applyResults: vi.fn(async (): Promise<unknown> => ({ auto: 1, proposed: 0, flagged: 0, policy_version: "AP-0.3" })),
    resetStates: vi.fn(async (): Promise<unknown> => ({ targets: 2 })),
  };
  // A test that overrides a method does not read that method's mock; the others keep their spies.
  return { ...base, ...over } as typeof base satisfies EngineStore;
};

describe("parseEngineInputs + sliceTarget", () => {
  it("one skill sees its own score of each episode, only the help that lists it, its own items, exposures and decisions", () => {
    const inputs = parseEngineInputs(raw());
    const w = sliceTarget(inputs, "A-L3-CAUSE-W");
    expect(w).toMatchObject({ targetKey: "A-L3-CAUSE-W", domain: "writing", policy: { version: "AP-0.3" } });
    expect(w.episodes).toEqual([expect.objectContaining({ episodeId: "ep1", decisionId: "vd1", score: 3, transferMarked: false, assistance: [], facets: { baseline: false, checkpoint: true, delayedCheck: false, transferCheck: false, revision: false } })]);
    expect(w.autoAttempts.map((a) => a.items)).toEqual([[{ itemId: "q2", result: "incorrect" }]]);
    expect(w.exposures).toEqual([{ at: expect.any(String), contextId: "A-W1-VOLCANOES", attemptId: "at1" }]);
    expect(w.decisions).toEqual([expect.objectContaining({ id: "md1", seq: 5, kind: "AUTO", toState: "SUPPORTED" })]);
    const r = sliceTarget(inputs, "A-T1-TEXT-R");
    expect(r.episodes[0]).toMatchObject({ decisionId: "vd2", score: null, assistance: [{ kind: "notes", verification: "declared" }] });
    expect(r.autoAttempts[0]?.items).toEqual([{ itemId: "q1", result: "correct" }]);
    expect(r.decisions).toEqual([]);
  });

  it("S2 / B1: carries when each decision was validated and the id of the transfer tick that counts (defaults: hand-in time, no tick)", () => {
    const base = raw();
    const w = sliceTarget(parseEngineInputs(base), "A-L3-CAUSE-W");
    expect(w.episodes[0]).toMatchObject({ validatedAt: w.episodes[0]!.at, transferMarkId: null });
    const ep = base.episodes[0]!;
    const withBoth = raw({ episodes: [{ ...ep, transfer_marked: true, transfer_mark_id: "mk1", scores: ep.scores.map((x) => ({ ...x, decided_at: "2026-10-22T09:00:00.987654+07:00" })) }] });
    expect(sliceTarget(parseEngineInputs(withBoth), "A-L3-CAUSE-W").episodes[0]).toMatchObject({ transferMarked: true, transferMarkId: "mk1", validatedAt: "2026-10-22T09:00:00.987+07:00" });
  });

  it("N2: every apply row carries when the inputs were read, and the AUTO route and the proposal key", async () => {
    const s = store();
    await recomputeLearner(s, "L1", null);
    const rows = (s.applyResults.mock.calls as unknown as unknown[][])[0]![1] as { computed_at: string; auto_route: unknown; propose_key: unknown }[];
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r).toMatchObject({ computed_at: "2026-10-23T12:00:00.123+07:00", auto_route: expect.anything() });
    expect(rows.every((r) => "propose_key" in r)).toBe(true);
  });

  it("reads Postgres timestamps (offset + microseconds) as dates; refuses unknown states and item results", () => {
    const w = sliceTarget(parseEngineInputs(raw()), "A-L3-CAUSE-W");
    expect(w.now.toISOString()).toBe("2026-10-23T05:00:00.123Z");
    expect(Date.parse(w.episodes[0]!.at)).toBe(Date.parse("2026-10-20T05:00:00.654Z"));
    expect(() => parseEngineInputs(raw({ decisions: [{ ...raw().decisions[0], to_state: "NEEDS_CONFIRMATION" }] }))).toThrow();
    expect(() => parseEngineInputs(raw({ auto: [{ ...raw().auto[0], items: [{ item_id: "q", target_key: "x", result: "needs_person" }] }] }))).toThrow();
  });
});

describe("recomputeLearner / rebuildLearner", () => {
  it("loads once, runs the engine for every skill of the inputs and applies one row per skill with the engine version", async () => {
    const s = store();
    const out = await recomputeLearner(s, "L1", null);
    expect(s.loadInputs).toHaveBeenCalledWith("L1", null);
    const [learner, rows, version] = s.applyResults.mock.calls[0] as unknown as [string, { target_key: string }[], string];
    expect([learner, rows.map((r) => r.target_key), version]).toEqual(["L1", ["A-L3-CAUSE-W", "A-T1-TEXT-R"], ENGINE_VERSION]);
    expect(out.results.map((r) => r.targetKey)).toEqual(["A-L3-CAUSE-W", "A-T1-TEXT-R"]);
    expect(out.applied).toEqual({ auto: 1, proposed: 0, flagged: 0, policyVersion: "AP-0.3" });
  });

  it("writes nothing for a child without a skill set (no policy) or without skills", async () => {
    for (const r of [raw({ policy: null }), raw({ targets: [] })]) {
      const s = store({ loadInputs: vi.fn(async (): Promise<unknown> => r) });
      expect((await recomputeLearner(s, "L1")).applied).toEqual({ auto: 0, proposed: 0, flagged: 0, policyVersion: null });
      expect(s.applyResults).not.toHaveBeenCalled();
    }
  });

  it("rebuild re-projects first, then runs the engine on every skill", async () => {
    const s = store();
    await rebuildLearner(s, "L1", "m-tutor");
    expect(s.resetStates).toHaveBeenCalledWith("L1", "m-tutor");
    expect(s.loadInputs).toHaveBeenCalledWith("L1", null);
    expect(s.resetStates.mock.invocationCallOrder[0]).toBeLessThan(s.loadInputs.mock.invocationCallOrder[0] as number);
  });

  it("toApplyRow keeps at most 200 evidence ids per list; parseApplied reads the SQL answer", () => {
    const many = Array.from({ length: 250 }, (_, i) => `e${i}`);
    const r = { targetKey: "K", auto: null, propose: "INDEPENDENT", raiseFlag: false, flag: { conflict: false, key: null, evidence: [] }, route: 1, evidenceKey: "1-0000000000000000", conditions: [], evidence: { auto: [], propose: many, flag: [] } } as unknown as EngineResult;
    expect(toApplyRow(r, "2026-10-23T05:00:00.000Z").evidence.propose).toHaveLength(MAX_EVIDENCE);
    expect(toApplyRow(r, "2026-10-23T05:00:00.000Z")).toMatchObject({ target_key: "K", propose: "INDEPENDENT", raise_flag: false, flag_key: null, route: 1 });
    expect(() => parseApplied({ auto: "1" })).toThrow();
  });
});

describe("evidenceKeyFor (B2)", () => {
  it("is the key the engine would store: the same as a recompute's, null when the skill cannot be computed", async () => {
    const s = store();
    const key = await evidenceKeyFor(s, "L1", "A-L3-CAUSE-W");
    expect(key).toMatch(/^[0-9]{1,6}-[0-9a-f]{16}$/);
    expect(s.loadInputs).toHaveBeenCalledWith("L1", ["A-L3-CAUSE-W"]);
    await recomputeLearner(s, "L1", null);
    const rows = (s.applyResults.mock.calls as unknown as unknown[][])[0]![1] as { target_key: string; evidence_key: string }[];
    expect(rows.find((r) => r.target_key === "A-L3-CAUSE-W")!.evidence_key).toBe(key);
    expect(await evidenceKeyFor(store({ loadInputs: vi.fn(async () => raw({ policy: null })) }), "L1", "A-L3-CAUSE-W")).toBeNull();
    expect(await evidenceKeyFor(s, "L1", "A-NOT-IN-SET")).toBeNull();
  });
});

describe("makeEngineHook (D16: never fails the write)", () => {
  it("logs an engine error and resolves; skips silently when the functions are not there yet (0023 not applied)", async () => {
    const log = vi.fn(async () => {});
    const broken = store({ loadInputs: vi.fn(async (): Promise<unknown> => { throw new Error("boom"); }) });
    await expect(makeEngineHook(() => broken, log)("L1", null)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
    const missing = store({ loadInputs: vi.fn(async (): Promise<unknown> => { throw Object.assign(new Error("fn"), { code: "PGRST202" }); }) });
    await makeEngineHook(() => missing, log)("L1", ["A-L3-CAUSE-W"]);
    expect(log).toHaveBeenCalledTimes(1);
    expect([isMissingFunction({ code: "42883" }), isMissingFunction({ code: "42501" }), isMissingFunction(null)]).toEqual([true, false, false]);
  });
});
