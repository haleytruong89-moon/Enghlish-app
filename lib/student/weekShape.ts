/**
 * eng_my_week / eng_week_facts (migration 0035) → WeekFacts. Pure (zod, strict): an unexpected key is a fault, never silently shown to the child.
 */
import { z } from "zod";
import type { UnitEvent } from "./achievements";
import { GOAL_LIMITS, type GoalRow } from "./goal";
import type { WeekFacts } from "./weekView";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ts = z.string().min(10);

const goal = z.strictObject({
  id: z.string(),
  kind: z.enum(["propose", "accept", "adjust", "withdraw"]),
  pieces: z.number().int().min(GOAL_LIMITS.min).max(GOAL_LIMITS.max).nullable(),
  applies_from: date.nullable(),
  responds_to: z.string().nullable(),
  by_role: z.enum(["student", "tutor"]),
  created_at: ts,
});

const raw = z.strictObject({
  now: ts,
  range: z.strictObject({ min: z.number().int().min(1).max(14), max: z.number().int().min(1).max(14) }),
  goals: z.array(goal),
  works: z.array(z.strictObject({ k: z.string().min(1), w: date })),
  first_work_at: ts.nullable(),
  writes: z.array(ts),
  first_topic_at: ts.nullable(),
  first_revision_at: ts.nullable(),
  unit_events: z.array(z.strictObject({ u: z.string(), s: z.enum(["not_started", "in_progress", "done", "skipped"]), at: ts })),
});

/** null in → null out (a function that answers null: the caller is not a student / the migration is not applied). */
export function parseWeekFacts(input: unknown): WeekFacts | null {
  if (input === null || input === undefined) return null;
  const r = raw.parse(input);
  return {
    now: r.now,
    range: r.range,
    goals: r.goals.map((g): GoalRow => ({ id: g.id, kind: g.kind, pieces: g.pieces, appliesFrom: g.applies_from, respondsTo: g.responds_to, byRole: g.by_role, createdAt: g.created_at })),
    works: r.works,
    firstWorkAt: r.first_work_at,
    writes: r.writes,
    firstTopicAt: r.first_topic_at,
    firstRevisionAt: r.first_revision_at,
    unitEvents: r.unit_events.map((e): UnitEvent => ({ u: e.u, s: e.s, at: e.at })),
  };
}
