/** Parse english.eng_engine_inputs (migration 0023) and cut it into one engine input per skill. Relative imports only (Node scripts use it). */
import { z } from "zod";
import { assessmentPolicySchema } from "../config/schemas";
import { DOMAIN_KEYS } from "../skillmap/types";
import { DECISION_KINDS, SKILL_STATES, type AssistanceMark, type EngineInput, type EngineResult, type Facets, type MasteryDecision } from "./types";

/** Postgres writes microseconds; JavaScript dates keep milliseconds. Cut the extra digits so every engine sees the same moment. */
const at = z.string().min(1).transform((s) => s.replace(/(\.\d{3})\d+/, "$1"));
const id = z.string().min(1);
const mode = z.enum(["PRACTICE", "INDEPENDENT_CHECK", "REVISION"]);
const facets = z
  .object({
    baseline: z.boolean().optional(),
    checkpoint: z.boolean().optional(),
    delayed_check: z.boolean().optional(),
    transfer_check: z.boolean().optional(),
    revision: z.boolean().optional(),
  })
  .transform((f): Facets => ({
    baseline: f.baseline ?? false,
    checkpoint: f.checkpoint ?? false,
    delayedCheck: f.delayed_check ?? false,
    transferCheck: f.transfer_check ?? false,
    revision: f.revision ?? false,
  }));
const assistance = z.array(z.object({ kind: z.string(), verification: z.enum(["observed", "declared", "unknown"]), targets: z.array(z.string()) }));
const episodeRow = z.object({
  episode_id: id, attempt_id: id, activity_id: id, at, context_id: z.string(), is_first_attempt: z.boolean(), mode,
  observed_directly: z.boolean(), facets, transfer_marked: z.boolean(), transfer_mark_id: z.string().nullable().default(null), declared_unknown: z.boolean(), assistance,
  scores: z.array(z.object({ target_key: z.string(), decision_id: id, decided_at: at.optional(), score: z.number().int().min(0).max(4).nullable(), not_observed: z.boolean() })),
});
const autoRow = z.object({
  attempt_id: id, episode_id: id, activity_id: id, at, is_first_attempt: z.boolean(), mode, facets, declared_unknown: z.boolean(), assistance,
  items: z.array(z.object({ item_id: z.string(), target_key: z.string(), result: z.enum(["correct", "incorrect", "blank"]) })),
});
const exposureRow = z.object({ target_key: z.string(), at, attempt_id: z.string().nullable(), context_id: z.string().nullable() });
const decisionRow = z.object({
  id, seq: z.number().int(), target_key: z.string(), kind: z.enum(DECISION_KINDS), from_state: z.enum(SKILL_STATES), to_state: z.enum(SKILL_STATES),
  evidence_key: z.string().nullable(), responds_to: z.string().nullable(), created_at: at,
});
const inputsRow = z.object({
  learner_id: id,
  now: at,
  policy: z.object({ version: z.string(), config: assessmentPolicySchema }).nullable(),
  targets: z.array(z.object({ key: z.string(), domain: z.enum(DOMAIN_KEYS).nullable() })),
  episodes: z.array(episodeRow),
  auto: z.array(autoRow),
  exposures: z.array(exposureRow),
  decisions: z.array(decisionRow),
});
export type EngineInputs = z.infer<typeof inputsRow>;

export function parseEngineInputs(raw: unknown): EngineInputs {
  return inputsRow.parse(raw);
}

const marks = (rows: z.infer<typeof assistance>, key: string): AssistanceMark[] =>
  rows.filter((r) => r.targets.includes(key)).map((r) => ({ kind: r.kind, verification: r.verification }));

/** The evidence of ONE skill: its own score of each validated episode (one per episode: counting is per episode), its items, exposures, decisions. */
export function sliceTarget(inputs: EngineInputs, key: string): EngineInput {
  if (inputs.policy === null) throw new Error("sliceTarget: this learner has no engine policy");
  return {
    targetKey: key,
    domain: inputs.targets.find((t) => t.key === key)?.domain ?? null,
    episodes: inputs.episodes.flatMap((e) => {
      const sc = e.scores.find((x) => x.target_key === key);
      if (!sc) return [];
      const score = sc.not_observed ? null : (sc.score as 0 | 1 | 2 | 3 | 4 | null);
      return [{
        episodeId: e.episode_id, attemptId: e.attempt_id, activityId: e.activity_id, at: e.at, contextId: e.context_id,
        isFirstAttempt: e.is_first_attempt, mode: e.mode, observedDirectly: e.observed_directly, facets: e.facets, transferMarked: e.transfer_marked, transferMarkId: e.transfer_mark_id,
        assistance: marks(e.assistance, key), declaredUnknown: e.declared_unknown, decisionId: sc.decision_id, validatedAt: sc.decided_at ?? e.at, score,
      }];
    }),
    autoAttempts: inputs.auto.flatMap((a) => {
      const items = a.items.filter((i) => i.target_key === key).map((i) => ({ itemId: i.item_id, result: i.result }));
      if (items.length === 0) return [];
      return [{
        attemptId: a.attempt_id, episodeId: a.episode_id, activityId: a.activity_id, at: a.at, isFirstAttempt: a.is_first_attempt, mode: a.mode,
        facets: a.facets, assistance: marks(a.assistance, key), declaredUnknown: a.declared_unknown, items,
      }];
    }),
    exposures: inputs.exposures.filter((x) => x.target_key === key).map((x) => ({ at: x.at, contextId: x.context_id, attemptId: x.attempt_id })),
    decisions: inputs.decisions
      .filter((d) => d.target_key === key)
      .map((d): MasteryDecision => ({
        id: d.id, seq: d.seq, kind: d.kind, fromState: d.from_state, toState: d.to_state, evidenceKey: d.evidence_key, respondsTo: d.responds_to, createdAt: d.created_at,
      })),
    policy: { version: inputs.policy.version, config: inputs.policy.config },
    now: new Date(inputs.now),
  };
}

/** Same cap as the CHECK on mastery_decisions.evidence_episode_ids. */
export const MAX_EVIDENCE = 200;
export type ApplyRow = {
  target_key: string;
  auto: string | null;
  propose: string | null;
  raise_flag: boolean;
  flag_key: string | null;
  route: 1 | 2 | null;
  /** Route behind the AUTO lift (N5); null = no AUTO. */
  auto_route: 1 | 2 | null;
  evidence_key: string;
  /** Key of the evidence the proposed level used (S3, B1); null = no proposal. */
  propose_key: string | null;
  /** When the inputs were read (eng_engine_inputs.now): an older computation never overwrites newer conditions (N2). */
  computed_at: string;
  conditions: EngineResult["conditions"];
  evidence: { auto: string[]; propose: string[]; flag: string[] };
};
const cap = (xs: readonly string[]) => xs.slice(0, MAX_EVIDENCE);
export function toApplyRow(r: EngineResult, computedAt: string): ApplyRow {
  return {
    target_key: r.targetKey,
    auto: r.auto,
    propose: r.propose,
    raise_flag: r.raiseFlag,
    flag_key: r.flag.key,
    route: r.route,
    auto_route: r.autoRoute,
    evidence_key: r.evidenceKey,
    propose_key: r.proposeKey,
    computed_at: computedAt,
    conditions: r.conditions.map((c) => ({ ...c, evidence: cap(c.evidence) })),
    evidence: { auto: cap(r.evidence.auto), propose: cap(r.evidence.propose), flag: cap(r.evidence.flag) },
  };
}

export type Applied = { auto: number; proposed: number; flagged: number; policyVersion: string | null };
const appliedRow = z.object({ auto: z.number().int(), proposed: z.number().int(), flagged: z.number().int(), policy_version: z.string().nullable() });
export function parseApplied(raw: unknown): Applied {
  const a = appliedRow.parse(raw);
  return { auto: a.auto, proposed: a.proposed, flagged: a.flagged, policyVersion: a.policy_version };
}
