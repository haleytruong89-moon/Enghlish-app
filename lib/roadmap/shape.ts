/**
 * eng_roadmap (adult read) → the view of the tutor page. Pure: zod on the way in (anything unexpected throws → logged 500 instead of a
 * half-right screen), then the rules of visible.ts / proposals.ts / mainCurriculum.ts on the facts. Nothing here talks to the database.
 */
import { z } from "zod";
import { buildProposals } from "./proposals";
import { MILESTONE_KINDS, MILESTONE_ROLES, MILESTONE_STATUSES, type MilestoneCard, type MilestoneVersion, type Proposal } from "./types";
import { buildCards, draftCards } from "./visible";

const text = z.string();
const milestone = z.object({
  id: text, milestone_id: text, version: z.number().int(), kind: z.enum(MILESTONE_KINDS), role: z.enum(MILESTONE_ROLES), title: text,
  curriculum_id: text.nullable(), after_unit: text.nullable(), target_month: text.nullable(), approx: z.boolean(),
  status: z.enum(MILESTONE_STATUSES), reason: text.nullable(), proposal_key: text.nullable(), created_at: text,
});
const curriculum = z.object({
  id: text, title: text, created_at: text, version_id: text, last_event_at: text.nullable(), last_event_id: text.nullable(),
  units: z.array(z.object({ code: text, ord: z.number().int(), title: text, skipped: z.boolean() })),
  events: z.array(z.object({ unit_code: text, status: text, at: text, id: text })).default([]),
  payload: z.unknown().nullable(),
});
const raw = z.object({
  track_id: text,
  goal_label: z.string().nullable(),
  main_id: text.nullable(),
  chosen_id: text.nullable(),
  intake_goals: z.unknown(),
  milestones: z.array(milestone),
  /** Not capped: every proposal key in use and the version of each milestone the child sees. */
  used_keys: z.array(text).default([]),
  visible_ids: z.record(text, text).default({}),
  curricula: z.array(curriculum),
});

export type UnitState = "done" | "in_progress" | "not_started" | "skipped";
export type RoadmapCurriculum = {
  id: string; title: string;
  units: { code: string; ord: number; title: string; skipped: boolean }[];
  /** Latest state of each Unit from the Unit events of the curriculum (units without an event are "not_started"). */
  unitStates: Record<string, UnitState>;
};

/** Latest event per Unit wins (same order as the SQL: created_at, id). "skipped" in the table of contents always wins. */
function unitStatesOf(c: { units: { code: string; skipped: boolean }[]; events: { unit_code: string; status: string; at: string; id: string }[] }): Record<string, UnitState> {
  const latest = new Map<string, { status: string; at: string; id: string }>();
  for (const e of c.events) {
    const cur = latest.get(e.unit_code);
    if (!cur || e.at > cur.at || (e.at === cur.at && e.id > cur.id)) latest.set(e.unit_code, e);
  }
  const out: Record<string, UnitState> = {};
  for (const u of c.units) {
    const s = latest.get(u.code)?.status;
    out[u.code] = u.skipped || s === "skipped" ? "skipped" : s === "done" ? "done" : s === "in_progress" ? "in_progress" : "not_started";
  }
  return out;
}
export type RoadmapView = {
  trackId: string;
  mainId: string | null;
  /** True when the tutor chose the main curriculum (false = the default of Q9). */
  mainChosen: boolean;
  curricula: RoadmapCurriculum[];
  cards: MilestoneCard[];
  proposals: Proposal[];
  /** Cards (not removed) that sit after a Unit that is no longer in the approved version of their curriculum. */
  orphanIds: string[];
};

const goalsSchema = z.array(z.object({ title: z.string(), due: z.string().nullish() }).passthrough());

const toVersion = (m: z.infer<typeof milestone>): MilestoneVersion => ({
  id: m.id, milestoneId: m.milestone_id, version: m.version, kind: m.kind, role: m.role, title: m.title, curriculumId: m.curriculum_id, afterUnit: m.after_unit,
  targetMonth: m.target_month, approx: m.approx, status: m.status, reason: m.reason, proposalKey: m.proposal_key, createdAt: m.created_at,
});

export function parseRoadmap(input: unknown): RoadmapView {
  const r = raw.parse(input);
  const goals = goalsSchema.safeParse(r.intake_goals);
  const cards = buildCards(r.milestones.map(toVersion), new Map(Object.entries(r.visible_ids)));
  const used = new Set([...r.used_keys, ...r.milestones.flatMap((m) => (m.proposal_key ? [m.proposal_key] : []))]);
  const main = r.curricula.find((c) => c.id === r.main_id) ?? null;
  const proposals = buildProposals({
    trackId: r.track_id,
    curriculum: main ? { id: main.id, payload: main.payload, units: main.units } : null,
    intakeGoals: goals.success ? goals.data.map((g) => ({ title: g.title, due: g.due ?? null })) : [],
    trackGoalLabel: r.goal_label,
    usedKeys: used,
    summitExists: cards.some((c) => c.childSees?.role === "summit"),
  });
  const unitsOf = new Map(r.curricula.map((c) => [c.id, new Set(c.units.map((u) => u.code))]));
  const orphanIds = cards
    .filter((c) => c.current.status !== "removed" && c.current.afterUnit !== null && !(c.current.curriculumId && unitsOf.get(c.current.curriculumId)?.has(c.current.afterUnit)))
    .map((c) => c.milestoneId);
  return {
    trackId: r.track_id,
    mainId: r.main_id,
    mainChosen: r.chosen_id !== null && r.chosen_id === r.main_id,
    curricula: r.curricula.map((c) => ({ id: c.id, title: c.title, units: c.units, unitStates: unitStatesOf(c) })),
    cards,
    proposals,
    orphanIds,
  };
}

/** "Chờ duyệt" counts only milestones whose current version is a draft (the child does not see them yet). */
export const draftCount = (v: Pick<RoadmapView, "cards">): number => draftCards(v.cards).length;

/** Proposals of the app not yet taken or dismissed: shown on the Lộ trình page and as a soft line on the desk, never as an inbox item. */
export const proposalCount = (v: Pick<RoadmapView, "proposals">): number => v.proposals.length;

/** The newest milestone the tutor confirmed within `days` days (for the parent's one line on the desk), or null. */
export function recentConfirmed(cards: readonly MilestoneCard[], now: number, days = 7): MilestoneVersion | null {
  const since = now - days * 86_400_000;
  return (
    cards
      .map((c) => c.current)
      .filter((v) => v.status === "confirmed" && Date.parse(v.createdAt) >= since)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null
  );
}
