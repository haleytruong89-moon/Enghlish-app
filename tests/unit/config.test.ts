import { describe, expect, it } from "vitest";
import { loadConfig } from "@/lib/config/content";
import { assessmentPolicySchema, catalogueSchema, targetSetsFileSchema } from "@/lib/config/schemas";
import { buildTargetKey, targetKeyToString } from "@/lib/config/targetKey";

const cfg = loadConfig();
const { catalogue, policy, targetSets } = cfg;
const targetById = new Map(catalogue.targets.map((t) => [t.id, t]));
const aggregateIds = new Set(catalogue.aggregate_indicators.map((a) => a.id));

describe("catalogue_v0.2.json", () => {
  it("parses and has the expected shape", () => {
    expect(catalogue.meta.version).toBe("0.2.1-draft");
    expect(catalogue.meta.assessment_policy_version).toBe("AP-0.2-pilot");
    expect(catalogue.dimensions).toHaveLength(18);
    const perTrack = catalogue.targets.reduce<Record<string, number>>((acc, t) => {
      acc[t.track] = (acc[t.track] ?? 0) + 1;
      return acc;
    }, {});
    expect(perTrack).toEqual({ A: 37, B: 33 });
    expect(catalogue.aggregate_indicators).toHaveLength(21);
    expect(catalogue.meta.activity_types.items.map((a) => a.id)).toHaveLength(8);
  });

  it("rejects a target that points at an unknown dimension", () => {
    const bad = structuredClone(catalogue);
    (bad.targets[0] as { dimension_id: string }).dimension_id = "ZZ";
    expect(catalogueSchema.safeParse(bad).success).toBe(false);
  });

  it("X1/X2 (and the autonomy dimensions) are never AI-scorable", () => {
    const byId = new Map(catalogue.dimensions.map((d) => [d.id, d]));
    for (const id of ["X1", "X2", "A1", "A3", "A5"]) expect(byId.get(id)?.ai_scorable, id).toBe(false);
    for (const t of catalogue.targets.filter((x) => ["X1", "X2"].includes(x.dimension_id))) {
      expect(t.ai_may_propose, t.id).toBe(false);
    }
  });

  it("thinking targets carry a task level (TL*), never a CEFR label", () => {
    const thinking = new Set(catalogue.dimensions.filter((d) => d.group === "thinking").map((d) => d.id));
    const thinkingTargets = catalogue.targets.filter((t) => thinking.has(t.dimension_id));
    expect(thinkingTargets.length).toBeGreaterThan(0);
    for (const t of thinkingTargets) {
      const head = t.target_demand.split("/")[0] ?? "";
      expect(head, t.id).toMatch(/^TL\d/);
      expect(head, t.id).not.toMatch(/\b(A1|A2|B1|B2|C1|C2)\b/);
    }
  });

  it("aggregate indicators are diagnostic only and never mastery gates", () => {
    for (const a of catalogue.aggregate_indicators) {
      expect(a.mastery_gate, a.id).toBe(false);
      expect(a.use, a.id).toBe("diagnostic_only");
    }
  });
});

describe("assessment policy AP-0.2-pilot", () => {
  it("parses and keeps the delayed-check rule at 14 days", () => {
    expect(policy.version).toBe("AP-0.2-pilot");
    expect(policy.config.transferable.delayedMinDaysFromLastExposure).toBe(14);
    expect(policy.config.independent.minFirstAttemptEpisodes).toBe(3);
    expect(policy.config.independent.minSpanDays).toBe(7);
    expect(policy.config.independent.maxAssistanceAffectingTarget).toBe(0);
  });

  it("is strict: unknown keys are rejected", () => {
    expect(assessmentPolicySchema.safeParse({ ...policy.config, surprise: 1 }).success).toBe(false);
  });
});

describe("target sets A-v1 / B-v1", () => {
  it("has exactly one set per track, version 1", () => {
    expect(targetSets.map((s) => [s.id, s.track, s.version])).toEqual([
      ["A-v1", "A", 1],
      ["B-v1", "B", 1],
    ]);
  });

  for (const set of targetSets) {
    describe(set.id, () => {
      it("has 12 distinct targets", () => {
        expect(set.target_ids).toHaveLength(12);
        expect(new Set(set.target_ids).size).toBe(12);
      });

      it("every target exists in the catalogue and belongs to the set's track", () => {
        for (const id of set.target_ids) {
          const t = targetById.get(id);
          expect(t, `${id} exists`).toBeDefined();
          expect(t?.track, `${id} track`).toBe(set.track);
          expect(t?.status, `${id} status`).toBe("active");
        }
      });

      it("has no aggregate indicator inside target_ids", () => {
        for (const id of set.target_ids) expect(aggregateIds.has(id), id).toBe(false);
      });

      it("tracking-only items exist, are of this track, and are not in the denominator", () => {
        const dimIds = new Set(catalogue.dimensions.map((d) => d.id));
        for (const d of set.tracking_only.dimensions) {
          expect(dimIds.has(d), d).toBe(true);
          const dimTargets = catalogue.targets.filter((t) => t.dimension_id === d && t.track === set.track);
          for (const t of dimTargets) expect(set.target_ids, t.id).not.toContain(t.id);
        }
        for (const a of set.tracking_only.aggregates) {
          const agg = catalogue.aggregate_indicators.find((x) => x.id === a);
          expect(agg, a).toBeDefined();
          expect(agg?.track, a).toBe(set.track);
          expect(set.target_ids).not.toContain(a);
        }
      });
    });
  }

  it("A-v1 matches PRD §3.1 (7 language + 4 thinking + 1 tutor-observed)", () => {
    const groupOf = (id: string) => {
      const t = targetById.get(id);
      return catalogue.dimensions.find((d) => d.id === t?.dimension_id)?.group;
    };
    const a = targetSets.find((s) => s.id === "A-v1");
    const counts = (a?.target_ids ?? []).reduce<Record<string, number>>((acc, id) => {
      const g = groupOf(id) ?? "?";
      acc[g] = (acc[g] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({ language: 7, thinking: 4, extension: 1 });
  });

  it("rejects a set with an empty target list", () => {
    expect(targetSetsFileSchema.safeParse([{ ...targetSets[0], target_ids: [] }]).success).toBe(false);
  });
});

describe("buildTargetKey", () => {
  const ctx = { descriptorVersion: "0.2.1-draft", assessmentPolicyVersion: "AP-0.2-pilot" };

  it("uses the target's own output modality when it is fixed", () => {
    const t = targetById.get("A-L3-CAUSE-W");
    if (!t) throw new Error("missing target");
    const key = buildTargetKey(t, ctx);
    expect(key).toMatchObject({
      competencyId: "A-L3-CAUSE-W",
      descriptorVersion: "0.2.1-draft",
      outputModality: "writing",
      assessmentPolicyVersion: "AP-0.2-pilot",
    });
    expect(key.targetDemand).toBe(t.target_demand);
  });

  it("rejects an episode whose modality contradicts a fixed target", () => {
    const t = targetById.get("A-L3-CAUSE-W");
    if (!t) throw new Error("missing target");
    expect(() => buildTargetKey(t, ctx, "speaking")).toThrow(/writing-only/);
  });

  it("'any' targets need the actual modality and give one key per modality", () => {
    const anyTarget = catalogue.targets.find((t) => t.output_modality === "any");
    if (!anyTarget) throw new Error("catalogue has no 'any' target");
    expect(() => buildTargetKey(anyTarget, ctx)).toThrow(/actual output modality/);
    const sp = buildTargetKey(anyTarget, ctx, "speaking");
    const wr = buildTargetKey(anyTarget, ctx, "writing");
    expect(sp.outputModality).toBe("speaking");
    expect(wr.outputModality).toBe("writing");
    expect(targetKeyToString(sp)).not.toBe(targetKeyToString(wr));
  });

  it("the string form is stable and depends on the descriptor version", () => {
    const t = targetById.get("A-T1-TEXT-L");
    if (!t) throw new Error("missing target");
    const mod = t.output_modality === "any" ? "speaking" : t.output_modality;
    const k1 = targetKeyToString(buildTargetKey(t, ctx, mod));
    expect(k1).toBe(targetKeyToString(buildTargetKey(t, ctx, mod)));
    expect(k1).not.toBe(targetKeyToString(buildTargetKey(t, { ...ctx, descriptorVersion: "0.3" }, mod)));
  });
});
