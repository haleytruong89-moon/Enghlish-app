import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/ops/logAppError", () => ({ logAppError: vi.fn(async () => {}) }));

import { skillStateCopy } from "@/lib/copy/vi";
import { loadSkillStatesSoft } from "@/lib/skills/load";
import type { SkillStates } from "@/lib/skills/types";

describe("N3: skill states never take a page down", () => {
  const states = { policyVersion: "AP-0.3", setId: "A-v1", rows: [] } as unknown as SkillStates;

  it("ok → the states; 0023 not applied (null) → no states and no warning; any error → logged, no states, failed = true (never a throw)", async () => {
    const log = vi.fn(async () => {});
    expect(await loadSkillStatesSoft("L1", "r", async () => states, log)).toEqual({ skills: states, failed: false });
    expect(await loadSkillStatesSoft("L1", "r", async () => null, log)).toEqual({ skills: null, failed: false });
    expect(log).not.toHaveBeenCalled();
    const boom = new Error("rpc exploded");
    expect(await loadSkillStatesSoft("L1", "GET /x", async () => { throw boom; }, log)).toEqual({ skills: null, failed: true });
    expect(log).toHaveBeenCalledWith({ route: "GET /x", code: "skill_states_load_failed", error: boom });
  });

  it("even a failing logger does not turn it into a 500", async () => {
    const r = await loadSkillStatesSoft("L1", "r", async () => { throw new Error("x"); }, async () => { throw new Error("log down"); });
    expect(r).toEqual({ skills: null, failed: true });
  });

  it("the two pages read the states through the soft loader and show the neutral line from vi.ts", () => {
    for (const file of ["app/learners/[id]/levels/page.tsx", "app/learners/[id]/targets/page.tsx"]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toContain("loadSkillStatesSoft(");
      expect(src, file).not.toMatch(/\bloadSkillStates\(/);
      expect(src, file).toContain("skillStateCopy.statesUnavailable");
    }
    expect(skillStateCopy.statesUnavailable.length).toBeGreaterThan(10);
  });
});
