/** Parse english.eng_point_inputs (migration 0027) and cut it into one engine input per point. Relative imports only (Node scripts use it). */
import { z } from "zod";
import { pointPolicyConfigSchema } from "../../config/pointPolicySchema";
import { SKILL_STATES } from "../types";
import type { PointDecision, PointEngineInput, PointEngineResult } from "./types";

const at = z.string().min(1).transform((s) => s.replace(/(\.\d{3})\d+/, "$1"));
const kinds = ["AUTO", "PROPOSED", "CONFIRMED", "REJECTED", "MANUAL", "FLAG"] as const;
const pointRow = z.object({
  tag_key: z.string().min(1),
  title_vi: z.string().nullable().default(null),
  group_key: z.string().nullable().default(null),
  taught_unit: z.boolean(),
  counted: z.array(z.object({ ref: z.string(), day: z.number().int(), correct: z.boolean(), source_id: z.string(), first: z.boolean() })),
  supported_correct: z.number().int(),
  supported_attempted: z.number().int(),
  decisions: z.array(
    z.object({
      id: z.string(), seq: z.number().int(), kind: z.enum(kinds), from_state: z.enum(SKILL_STATES), to_state: z.enum(SKILL_STATES),
      evidence_key: z.string().nullable(), responds_to: z.string().nullable(), created_at: at,
    }),
  ),
});
const inputsRow = z.object({
  learner_id: z.string(),
  now: at,
  policy: z.object({ version: z.string(), config: pointPolicyConfigSchema }).nullable(),
  points: z.array(pointRow),
});
export type PointInputs = z.infer<typeof inputsRow>;

export function parsePointInputs(raw: unknown): PointInputs {
  return inputsRow.parse(raw);
}

export function slicePoint(inputs: PointInputs, tag: string): PointEngineInput {
  if (inputs.policy === null) throw new Error("slicePoint: no point policy installed");
  const p = inputs.points.find((x) => x.tag_key === tag);
  if (!p) throw new Error(`slicePoint: unknown point ${tag}`);
  return {
    tagKey: p.tag_key,
    taughtUnit: p.taught_unit,
    counted: p.counted.map((c) => ({ ref: c.ref, day: c.day, correct: c.correct, sourceId: c.source_id, first: c.first })),
    supportedCorrect: p.supported_correct,
    supportedAttempted: p.supported_attempted,
    decisions: p.decisions.map((d): PointDecision => ({
      id: d.id, seq: d.seq, kind: d.kind, fromState: d.from_state, toState: d.to_state, evidenceKey: d.evidence_key, respondsTo: d.responds_to, createdAt: d.created_at,
    })),
    policy: { version: inputs.policy.version, config: inputs.policy.config },
    now: new Date(inputs.now),
  };
}

/** Same cap as the CHECK on point_decisions.evidence_item_refs. */
export const MAX_POINT_EVIDENCE = 400;
export type PointApplyRow = {
  tag_key: string;
  auto: string | null;
  propose: string | null;
  raise_flag: boolean;
  flag_key: string | null;
  evidence_key: string;
  propose_key: string | null;
  /** When the inputs were read (eng_point_inputs.now): an older computation never overwrites newer conditions (N2). */
  computed_at: string;
  conditions: PointEngineResult["conditions"];
  evidence: { auto: string[]; propose: string[]; flag: string[] };
};
/** The most recent MAX_POINT_EVIDENCE questions (refs run oldest → newest); the database keeps the same bound. */
const cap = (xs: readonly string[]) => xs.slice(-MAX_POINT_EVIDENCE);
export function toPointApplyRow(r: PointEngineResult, computedAt: string): PointApplyRow {
  return {
    tag_key: r.tagKey,
    auto: r.auto,
    propose: r.propose,
    raise_flag: r.raiseFlag,
    flag_key: r.flag.key,
    evidence_key: r.evidenceKey,
    propose_key: r.proposeKey,
    computed_at: computedAt,
    conditions: r.conditions,
    evidence: { auto: cap(r.evidence.auto), propose: cap(r.evidence.propose), flag: cap(r.evidence.flag) },
  };
}

export type PointFailedKey = { tagKey: string; sqlstate: string; message: string };
export type PointApplied = { auto: number; proposed: number; flagged: number; failed: number; failedKeys: PointFailedKey[]; policyVersion: string | null };
const appliedRow = z.object({ auto: z.number().int(), proposed: z.number().int(), flagged: z.number().int(), failed: z.number().int().optional().default(0), failed_keys: z.array(z.object({ tag_key: z.string(), sqlstate: z.string(), message: z.string() })).optional().default([]), policy_version: z.string().nullable() });
export function parsePointApplied(raw: unknown): PointApplied {
  const a = appliedRow.parse(raw);
  return { auto: a.auto, proposed: a.proposed, flagged: a.flagged, failed: a.failed, failedKeys: a.failed_keys.map((k) => ({ tagKey: k.tag_key, sqlstate: k.sqlstate, message: k.message })), policyVersion: a.policy_version };
}
