import { describe, expect, it } from "vitest";
import { parseImport } from "@/lib/import/shape";

const base = {
  id: "i1", learner_id: "l1", track_id: "B", title: "T", taken_on: "2026-10-23", support_level: "tu_lam", status: "reading",
  // the REAL column default of import_batches.payload (migration 0027)
  payload: { items: [] }, error_code: null, work_file_id: "w", key_file_id: "k", allow_other: false, template_id: null, attempt_id: null,
  updated_at: "2026-11-08 10:00:00+00", created_at: "2026-11-08T10:00:00Z",
};

describe("parseImport with the default empty payload", () => {
  for (const status of ["reading", "ai_failed", "draft"] as const) {
    it(`${status} with {"items": []} parses`, () => {
      const v = parseImport({ ...base, status }, Date.parse("2026-11-08T10:01:00Z"));
      expect(v.payload).toEqual({ items: [] });
      expect(v.stale).toBe(false);
    });
  }
  it("a reading batch older than the stale limit is flagged stale (so the timeout can run)", () => {
    const v = parseImport(base, Date.parse("2026-11-08T11:00:00Z"));
    expect(v.stale).toBe(true);
  });
  it("still rejects a malformed item", () => {
    expect(() => parseImport({ ...base, payload: { items: [{ n: 0 }] } })).toThrow();
  });
});
