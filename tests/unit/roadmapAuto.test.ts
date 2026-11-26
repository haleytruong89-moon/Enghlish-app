import { describe, expect, it } from "vitest";
import { parseRoadmap } from "@/lib/roadmap/shape";

const raw = {
  track_id: "B", goal_label: null, main_id: "c1", chosen_id: null, intake_goals: [], milestones: [], used_keys: [], visible_ids: {},
  curricula: [{
    id: "c1", title: "Destination", created_at: "2026-11-01T00:00:00Z", version_id: "v1", last_event_at: null, last_event_id: null, payload: null,
    units: [13, 14, 15].map((n) => ({ code: `U${n}`, ord: n, title: `Unit ${n}`, skipped: false })),
    events: [{ unit_code: "U13", status: "done", at: "2026-11-20T00:00:00Z", id: "e1" }],
  }],
};

describe("Lộ trình (adult) with L2 'Đang học' from work sent", () => {
  it("merges the app's events as on the Giáo trình page: up only, the adult's done stays", () => {
    const v = parseRoadmap(raw, [{ curriculum_id: "c1", unit_code: "U14", at: "2026-11-24T00:00:00Z" }, { curriculum_id: "c1", unit_code: "U13", at: "2026-11-24T00:00:00Z" }, { curriculum_id: "other", unit_code: "U15", at: "2026-11-24T00:00:00Z" }]);
    expect(v.curricula[0]!.unitStates).toEqual({ U13: "done", U14: "in_progress", U15: "not_started" });
    expect(parseRoadmap(raw).curricula[0]!.unitStates.U14).toBe("not_started");
  });
});
