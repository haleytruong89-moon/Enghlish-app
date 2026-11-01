/** Parse eng_skill_states / eng_skill_inbox (migration 0023). zod strips unknown keys; anything unexpected throws (→ 500, logged). */
import { z } from "zod";
import { CONDITION_IDS, SKILL_STATES, type Condition, type Route } from "@/lib/engine/types";
import { DOMAIN_KEYS } from "@/lib/skillmap/types";
import type { SkillInbox, SkillStates } from "./types";

const state = z.enum(SKILL_STATES);
const route = z.union([z.literal(1), z.literal(2)]).nullable();
const condition = z.object({
  id: z.enum(CONDITION_IDS), level: z.number().int().min(1).max(4), route: z.union([z.literal(1), z.literal(2)]),
  have: z.number(), need: z.number(), met: z.boolean(), evidence: z.array(z.string()),
});
const toConditions = (cs: z.infer<typeof condition>[]): Condition[] => cs.map((c) => ({ ...c, level: c.level as Condition["level"] }));

const statesRow = z.object({
  policy_version: z.string().nullable(),
  set_id: z.string().nullable(),
  rows: z.array(z.object({
    target_key: z.string(), title_vi: z.string().nullable(), domain_key: z.enum(DOMAIN_KEYS).nullable(), state,
    state_kind: z.enum(["AUTO", "CONFIRMED", "MANUAL"]).nullable(), state_since: z.string().nullable(),
    flag: z.object({ id: z.string(), at: z.string() }).nullable(),
    proposal: z.object({ id: z.string(), to_state: state, route, at: z.string() }).nullable(),
    conditions: z.array(condition), route, evaluated_at: z.string().nullable(), updated_at: z.string().nullable(),
  })),
});

export function parseSkillStates(raw: unknown): SkillStates {
  const s = statesRow.parse(raw);
  return {
    policyVersion: s.policy_version,
    setId: s.set_id,
    rows: s.rows.map((r) => ({
      targetKey: r.target_key, titleVi: r.title_vi, domainKey: r.domain_key, state: r.state, auto: r.state_kind === "AUTO", stateSince: r.state_since,
      flag: r.flag, proposal: r.proposal ? { id: r.proposal.id, toState: r.proposal.to_state, route: r.proposal.route as Route | null, at: r.proposal.at } : null,
      conditions: toConditions(r.conditions), route: r.route as Route | null, evaluatedAt: r.evaluated_at,
    })),
  };
}

const inboxRow = z.object({
  open: z.number().int(),
  decidable: z.number().int(),
  items: z.array(z.object({
    id: z.string(), kind: z.enum(["PROPOSED", "FLAG"]), learner_id: z.string(), alias: z.string(), is_test: z.boolean(), target_key: z.string(),
    title_vi: z.string().nullable(), from_state: state, to_state: state, current_state: state, route, conditions: z.array(condition),
    evidence: z.array(z.object({ episode_id: z.string(), title_vi: z.string().nullable(), step_no: z.number().int(), at: z.string() })),
    created_at: z.string(), can_decide: z.boolean(),
  })),
});

export function parseSkillInbox(raw: unknown): SkillInbox {
  const b = inboxRow.parse(raw);
  return {
    open: b.open,
    decidable: b.decidable,
    items: b.items.map((i) => ({
      id: i.id, kind: i.kind, learnerId: i.learner_id, alias: i.alias, isTest: i.is_test, targetKey: i.target_key, titleVi: i.title_vi,
      fromState: i.from_state, toState: i.to_state, currentState: i.current_state, route: i.route as Route | null, conditions: toConditions(i.conditions),
      evidence: i.evidence.map((e) => ({ episodeId: e.episode_id, titleVi: e.title_vi, stepNo: e.step_no, at: e.at })),
      createdAt: i.created_at, canDecide: i.can_decide,
    })),
  };
}
