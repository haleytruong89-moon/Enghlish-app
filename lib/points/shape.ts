/** Parse eng_point_inbox / eng_point_map (migration 0027). zod strips unknown keys; anything unexpected throws (→ 500, logged). */
import { z } from "zod";
import { POINT_CONDITION_IDS } from "@/lib/engine/points/types";
import { SKILL_STATES } from "@/lib/engine/types";
import type { PointInbox, PointMap } from "./types";

const state = z.enum(SKILL_STATES);
const condition = z.object({ id: z.enum(POINT_CONDITION_IDS), level: z.union([z.literal(2), z.literal(3), z.literal(4)]), have: z.number(), need: z.number(), met: z.boolean() });

const inboxRow = z.object({
  open: z.number().int(),
  decidable: z.number().int(),
  items: z.array(
    z.object({
      id: z.string(), kind: z.enum(["PROPOSED", "FLAG"]), learner_id: z.string(), alias: z.string(), is_test: z.boolean(), tag_key: z.string(),
      title_vi: z.string().nullable(), from_state: state, to_state: state, current_state: state, conditions: z.array(condition),
      evidence: z.array(z.object({ ref: z.string(), item: z.string(), title_vi: z.string().nullable(), at: z.string() })),
      created_at: z.string(), can_decide: z.boolean(),
    }),
  ),
});

export function parsePointInbox(raw: unknown): PointInbox {
  const b = inboxRow.parse(raw);
  return {
    open: b.open,
    decidable: b.decidable,
    items: b.items.map((i) => ({
      id: i.id, kind: i.kind, learnerId: i.learner_id, alias: i.alias, isTest: i.is_test, tagKey: i.tag_key, titleVi: i.title_vi, fromState: i.from_state,
      toState: i.to_state, currentState: i.current_state, conditions: i.conditions,
      evidence: i.evidence.map((e) => ({ ref: e.ref, item: e.item, titleVi: e.title_vi, at: e.at })),
      createdAt: i.created_at, canDecide: i.can_decide,
    })),
  };
}

const mapRow = z.object({
  learner_id: z.string(),
  policy_version: z.string().nullable(),
  points: z.array(
    z.object({
      tag_key: z.string(), title_vi: z.string().nullable(), group_key: z.string().nullable(), group_vi: z.string().nullable(), domain_key: z.string().nullable(),
      domain_vi: z.string().nullable(), state, state_since: z.string().nullable(), state_kind: z.string().nullable(),
      flag: z.object({ id: z.string(), at: z.string() }).nullable(),
      proposal: z.object({ id: z.string(), to_state: state, at: z.string() }).nullable(),
      conditions: z.array(condition),
      curricula: z.array(z.object({ id: z.string(), title: z.string() })),
      answers: z.array(z.object({ ref: z.string(), title: z.string().nullable(), at: z.string(), correct: z.boolean().nullable(), support: z.boolean().nullable() })),
    }),
  ),
});

export function parsePointMap(raw: unknown): PointMap {
  const m = mapRow.parse(raw);
  return {
    learnerId: m.learner_id,
    policyVersion: m.policy_version,
    points: m.points.map((p) => ({
      tagKey: p.tag_key, titleVi: p.title_vi, groupKey: p.group_key, groupVi: p.group_vi, domainKey: p.domain_key, domainVi: p.domain_vi, state: p.state,
      stateSince: p.state_since, stateKind: p.state_kind === "AUTO" || p.state_kind === "CONFIRMED" || p.state_kind === "MANUAL" ? p.state_kind : null,
      flag: p.flag, proposal: p.proposal ? { id: p.proposal.id, toState: p.proposal.to_state, at: p.proposal.at } : null, conditions: p.conditions,
      curricula: p.curricula, answers: p.answers,
    })),
  };
}
