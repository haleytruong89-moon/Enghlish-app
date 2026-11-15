import { describe, expect, it } from "vitest";
import { parseWeekFacts } from "@/lib/student/weekShape";

const OK = {
  now: "2026-11-12T03:00:00.123456+00:00", range: { min: 3, max: 6 },
  goals: [{ id: "g1", kind: "accept", pieces: 4, applies_from: "2026-11-16", responds_to: "g0", by_role: "tutor", created_at: "2026-11-12T02:00:00Z" }],
  works: [{ k: "a:1", w: "2026-11-09" }], first_work_at: "2026-10-01T03:00:00Z", writes: ["2026-10-02T03:00:00Z"], first_topic_at: null, first_revision_at: null,
  unit_events: [{ u: "U1", s: "done", at: "2026-10-03T03:00:00Z" }],
};

describe("parseWeekFacts (the child's and the adult's read have one shape)", () => {
  it("maps the database keys to the view's names", () => {
    expect(parseWeekFacts(OK)).toEqual({
      now: OK.now, range: { min: 3, max: 6 },
      goals: [{ id: "g1", kind: "accept", pieces: 4, appliesFrom: "2026-11-16", respondsTo: "g0", byRole: "tutor", createdAt: "2026-11-12T02:00:00Z" }],
      works: [{ k: "a:1", w: "2026-11-09" }], firstWorkAt: "2026-10-01T03:00:00Z", writes: ["2026-10-02T03:00:00Z"], firstTopicAt: null, firstRevisionAt: null,
      unitEvents: [{ u: "U1", s: "done", at: "2026-10-03T03:00:00Z" }],
    });
  });
  it("null in, null out (a non-student caller / not applied)", () => {
    expect(parseWeekFacts(null)).toBeNull();
    expect(parseWeekFacts(undefined)).toBeNull();
  });
  it("an unexpected key anywhere is refused (a score-like field can never reach the page by accident); so is a goal outside 1–14", () => {
    expect(() => parseWeekFacts({ ...OK, score: 3 })).toThrow();
    expect(() => parseWeekFacts({ ...OK, works: [{ k: "a:1", w: "2026-11-09", correct: true }] })).toThrow();
    expect(() => parseWeekFacts({ ...OK, goals: [{ ...OK.goals[0], pieces: 15 }] })).toThrow();
    expect(() => parseWeekFacts({ ...OK, works: [{ k: "a:1", w: "09/11/2026" }] })).toThrow();
  });
});
