import { describe, expect, it } from "vitest";
import { formatAiReport } from "@/lib/curriculum/report";

describe("AI report for PROGRESS.md (spec §8)", () => {
  it("one row per AI version; more than 20 % edited says STOP", () => {
    const out = formatAiReport([
      { title: "Destination C1&C2", version: 1, approved_at: "2026-11-10 09:00:00+07", runs: 1, input_tokens: 4200, output_tokens: 2600, cost_usd: 0.0344, ai_rows: 26, edited_pct: 8, quality: "ok" },
      { title: "Reading Explorer 3", version: 1, approved_at: null, runs: 2, input_tokens: 9000, output_tokens: 3000, cost_usd: 0.048, ai_rows: null, edited_pct: null, quality: null },
      { title: "Great Writing 4", version: 1, approved_at: "2026-11-12 09:00:00+07", runs: 1, input_tokens: 3000, output_tokens: 2000, cost_usd: 0.026, ai_rows: 10, edited_pct: 30, quality: "needs_work" },
    ]).split("\n");
    expect(out).toHaveLength(5);
    expect(out[2]).toBe("| Destination C1&C2 | v1 | 2026-11-10 | 1 | 4200 / 2600 | $0.0344 | 26 | 8 % | ok | đạt |");
    expect(out[3]).toContain("chưa duyệt");
    expect(out[4]).toContain("DỪNG: chỉnh công thức");
  });
});
