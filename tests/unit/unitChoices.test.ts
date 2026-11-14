import { describe, expect, it } from "vitest";
import { buildCards } from "@/lib/curriculum/shape";
import { buildUnitChoices } from "@/lib/curriculum/unitChoices";

const unit = (n: number, page: number, extra: Record<string, unknown> = {}) => ({
  code: `U${n}`, title: `Unit ${n}`, section: "G", page, skipped: false, points: n === 3 ? ["c"] : [], missing_points: [], needs_review: false,
  review_reason: null, origin: "ai", dropped: false, edit_reason: null, flags: [], ai_index: null, ...extra,
});
const payload = { units: [unit(1, 6), unit(2, 14), unit(3, 22), unit(4, 30)], ignored: [{ label: "Review 1", page: 20, reason: "review" }, { label: "Review 2", page: 38, reason: "review" }, { label: "Progress Test 1", page: 40, reason: "other" }, { label: "Grammar reference", page: 90, reason: "reference" }] };
const cards = () => buildCards({
  curricula: [{ id: "c1", title: "Destination C1 C2", level_note: null, created_at: "2026-11-01T00:00:00Z" }, { id: "c2", title: "Nháp", level_note: null, created_at: "2026-11-02T00:00:00Z" }],
  versions: [{ id: "v1", curriculum_id: "c1", version: 1, status: "approved", error_code: null }, { id: "v2", curriculum_id: "c2", version: 1, status: "draft", error_code: null }],
  units: [1, 2, 3, 4].map((n) => ({ version_id: "v1", code: `U${n}`, ord: n, title: `Unit ${n}`, section: "G", page: n * 8 - 2, skipped: n === 4 })),
  points: [{ version_id: "v1", code: "U3", tag_key: "c", ord: 1 }],
  events: [{ id: "e1", curriculum_id: "c1", unit_code: "U2", status: "in_progress", created_at: "2026-11-05T00:00:00Z" }],
});

describe("buildUnitChoices", () => {
  it("offers approved curricula only; skipped Units are left out; Review rows know their Units; reference pages are not offered", () => {
    const [c, ...rest] = buildUnitChoices(cards(), { v1: payload });
    expect(rest).toEqual([]);
    expect(c?.units.map((u) => [u.code, u.status])).toEqual([["U1", "not_started"], ["U2", "in_progress"], ["U3", "not_started"]]);
    expect(c?.units[2]?.points).toEqual(["c"]);
    expect(c?.reviews.map((r) => [r.label, r.progressTest, r.related])).toEqual([
      ["Review 1", false, ["U1", "U2"]],
      ["Review 2", false, ["U3"]],
      ["Progress Test 1", true, ["U1", "U2", "U3"]],
    ]);
  });
  it("a payload that cannot be read still gives the Units", () => {
    const [c] = buildUnitChoices(cards(), { v1: { nope: 1 } });
    expect(c?.units).toHaveLength(3);
    expect(c?.reviews).toEqual([]);
  });
  it("no approved curriculum → nothing", () => {
    expect(buildUnitChoices([], {})).toEqual([]);
  });
});
