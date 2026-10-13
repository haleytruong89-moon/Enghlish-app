/**
 * TargetKey per catalogue `meta.target_key`:
 *   competency_id · descriptor_version · target_demand · input_modality ·
 *   output_modality (the ACTUAL modality of the episode when the target says "any") ·
 *   assessment_policy_version
 * A target with output_modality "any" therefore has one state per actual modality — speaking
 * and writing are never pooled. Pure functions, no I/O.
 */
import type { Target, TargetKey } from "./schemas";

export type TargetKeyContext = {
  descriptorVersion: string;
  assessmentPolicyVersion: string;
};

export type ActualOutputModality = Exclude<Target["output_modality"], "any">;

export function buildTargetKey(
  target: Pick<Target, "id" | "target_demand" | "input_modality" | "output_modality">,
  ctx: TargetKeyContext,
  actualOutput?: ActualOutputModality,
): TargetKey {
  let outputModality: ActualOutputModality;
  if (target.output_modality === "any") {
    if (!actualOutput) {
      throw new Error(`target ${target.id} has output_modality "any": the actual output modality is required`);
    }
    outputModality = actualOutput;
  } else {
    if (actualOutput && actualOutput !== target.output_modality) {
      throw new Error(
        `target ${target.id} is ${target.output_modality}-only, got an episode with ${actualOutput} output`,
      );
    }
    outputModality = target.output_modality;
  }
  return {
    competencyId: target.id,
    descriptorVersion: ctx.descriptorVersion,
    targetDemand: target.target_demand,
    inputModality: target.input_modality,
    outputModality,
    assessmentPolicyVersion: ctx.assessmentPolicyVersion,
  };
}

/** Stable string form (fixed field order) usable as a map key / jsonb value. */
export function targetKeyToString(key: TargetKey): string {
  return JSON.stringify([
    key.competencyId,
    key.descriptorVersion,
    key.targetDemand,
    key.inputModality,
    key.outputModality,
    key.assessmentPolicyVersion,
  ]);
}
