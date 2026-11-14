import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("vercel.json", () => {
  const cfg = JSON.parse(readFileSync("vercel.json", "utf8")) as { regions?: string[]; functions?: Record<string, { regions?: string[] }> };
  it("pins the functions to exactly one region next to Supabase (Singapore); Hobby allows only one", () => {
    expect(cfg.regions).toEqual(["sin1"]);
  });
  it("has no per-function region that could disagree", () => {
    for (const f of Object.values(cfg.functions ?? {})) expect(f.regions).toBeUndefined();
  });
});
