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
  payload: z.unknown().nullable(),
});
const raw = z.object({
  track_id: text,
  goal_label: z.string().nullable(),
  main_id: text.nullable(),
  chosen_id: text.nullable(),
  intake_goals: z.unknown(),
  milestones: z.array(milestone),
  curricula: z.array(curriculum),
});

export type RoadmapCurriculum = { id: string; title: string; units: { code: string; ord: number; title: string; skipped: boolean }[] };
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
  const cards = buildCards(r.milestones.map(toVersion));
  const used = new Set(r.milestones.flatMap((m) => (m.proposal_key ? [m.proposal_key] : [])));
  const main = r.curricula.find((c) => c.id === r.main_id) ?? null;
  const proposals = buildProposals({
    trackId: r.track_id,
    curriculum: main ? { id: main.id, payload: main.payload, units: main.units } : null,
    intakeGoals: goals.success ? goals.data.map((g) => ({ title: g.title, due: g.due ?? null })) : [],
    trackGoalLabel: r.goal_label,
    usedKeys: used,
  });
  const unitsOf = new Map(r.curricula.map((c) => [c.id, new Set(c.units.map((u) => u.code))]));
  const orphanIds = cards
    .filter((c) => c.current.status !== "removed" && c.current.afterUnit !== null && !(c.current.curriculumId && unitsOf.get(c.current.curriculumId)?.has(c.current.afterUnit)))
    .map((c) => c.milestoneId);
  return {
    trackId: r.track_id,
    mainId: r.main_id,
    mainChosen: r.chosen_id !== null && r.chosen_id === r.main_id,
    curricula: r.curricula.map((c) => ({ id: c.id, title: c.title, units: c.units })),
    cards,
    proposals,
    orphanIds,
  };
}

/** The numbers the desk and "Chờ duyệt" show: proposals not yet handled + milestones whose current version is a draft. */
export function waitingCount(v: Pick<RoadmapView, "cards" | "proposals">): number {
  return v.proposals.length + draftCards(v.cards).length;
}

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
