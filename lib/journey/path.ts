/**
 * The mountain of "Hành trình" (plan §3.3). Pure. Input = what eng_my_roadmap returns (already shaped); output = what the SVG and the
 * list draw. The child sees counts of Units (never a score), and only milestones the tutor confirmed.
 *   - a Unit's state is its own latest event (not inferred from its place); a Unit skipped in the version or by its latest event is "skipped" and not counted;
 *   - the climber stands on the highest in-progress Unit; else the highest done Unit; else at the foot;
 *   - k(M) = counted Units with order ≤ the Unit M sits after that are not done yet; k = 0 → "reached";
 *   - a flag whose Unit is not in the version (or that has only a month) is not drawn: it goes to "Mốc khác".
 */
import type { ChildMilestone } from "@/lib/roadmap/types";

export type JourneyUnitStatus = "done" | "in_progress" | "not_started" | "skipped";
export type JourneyUnitInput = { code: string; ord: number; title: string; skipped: boolean; status: "done" | "in_progress" | "not_started" | "skipped"; doneOn: string | null };
export type JourneyOtherInput = { title: string; done: number; total: number };
export type JourneyInput = {
  main: { id: string; title: string } | null;
  units: readonly JourneyUnitInput[];
  others: readonly JourneyOtherInput[];
  milestones: readonly ChildMilestone[];
};

export type JourneyFlag = { id: string; title: string; kind: ChildMilestone["kind"]; afterUnit: string; remaining: number; reached: boolean; next: boolean };
export type JourneyNode = {
  code: string; ord: number; title: string; status: JourneyUnitStatus; doneOn: string | null;
  /** "here" = the climber is on it now; "justDone" = the climber stands on the last finished Unit. */
  climber: "here" | "justDone" | null;
  /** The line from this Unit to the next one is drawn bold (both are done and neighbours). */
  doneToNext: boolean;
  flags: JourneyFlag[];
};
export type JourneySummary =
  | { kind: "none" }
  | { kind: "toMilestone"; done: number; total: number; remaining: number; title: string }
  | { kind: "toSummit"; done: number; total: number; remaining: number }
  | { kind: "finished"; done: number; total: number };
export type JourneyOtherMilestone = { id: string; title: string; kind: ChildMilestone["kind"]; targetMonth: string | null; approx: boolean };
export type Journey = {
  hasMain: boolean;
  mainTitle: string | null;
  nodes: JourneyNode[];
  climber: { at: "unit"; code: string; kind: "here" | "justDone" } | { at: "foot" } | null;
  summary: JourneySummary;
  /** The summit the tutor confirmed (null = "Đỉnh của bạn — thầy/cô sẽ đặt tên"). */
  summit: { title: string; targetMonth: string | null; approx: boolean } | null;
  beyond: { id: string; title: string; targetMonth: string | null; approx: boolean }[];
  otherMilestones: JourneyOtherMilestone[];
  others: { title: string; done: number; total: number }[];
};

const byMonthThenTitle = (a: { targetMonth: string | null; title: string }, b: { targetMonth: string | null; title: string }) =>
  a.targetMonth === b.targetMonth ? a.title.localeCompare(b.title) : a.targetMonth === null ? 1 : b.targetMonth === null ? -1 : a.targetMonth < b.targetMonth ? -1 : 1;

export function buildJourney(input: JourneyInput): Journey {
  const units = [...input.units].sort((a, b) => a.ord - b.ord);
  const statusOf = (u: JourneyUnitInput): JourneyUnitStatus => (u.skipped || u.status === "skipped" ? "skipped" : u.status);
  const counted = units.filter((u) => statusOf(u) !== "skipped");
  const done = counted.filter((u) => statusOf(u) === "done").length;
  const total = counted.length;
  const highest = (s: JourneyUnitStatus) => [...units].filter((u) => statusOf(u) === s).sort((a, b) => b.ord - a.ord)[0] ?? null;
  const hereUnit = highest("in_progress");
  const doneUnit = highest("done");
  const climbUnit = hereUnit ?? doneUnit;
  const hasMain = input.main !== null;

  const inVersion = new Set(units.map((u) => u.code));
  const ordOf = new Map(units.map((u) => [u.code, u.ord]));
  const confirmed = input.milestones;

  // Flags drawn on the mountain: a flag of the main curriculum whose Unit is in the version.
  const drawn: JourneyFlag[] = [];
  const other: JourneyOtherMilestone[] = [];
  for (const m of confirmed) {
    if (m.role !== "flag") continue;
    const placed = hasMain && m.curriculumId === input.main?.id && m.afterUnit !== null && inVersion.has(m.afterUnit);
    if (!placed) {
      other.push({ id: m.id, title: m.title, kind: m.kind, targetMonth: m.targetMonth, approx: m.approx });
      continue;
    }
    const ord = ordOf.get(m.afterUnit as string) as number;
    const remaining = counted.filter((u) => u.ord <= ord && statusOf(u) !== "done").length;
    drawn.push({ id: m.id, title: m.title, kind: m.kind, afterUnit: m.afterUnit as string, remaining, reached: remaining === 0, next: false });
  }
  const upcoming = drawn.filter((f) => !f.reached).sort((a, b) => (ordOf.get(a.afterUnit) as number) - (ordOf.get(b.afterUnit) as number) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const nextFlag = upcoming[0] ?? null;
  if (nextFlag) nextFlag.next = true;

  const nodes: JourneyNode[] = units.map((u, i) => {
    const st = statusOf(u);
    const nx = units[i + 1];
    return {
      code: u.code, ord: u.ord, title: u.title, status: st, doneOn: st === "done" ? u.doneOn : null,
      climber: climbUnit && climbUnit.code === u.code ? (hereUnit ? "here" : "justDone") : null,
      doneToNext: nx !== undefined && st === "done" && statusOf(nx) === "done",
      flags: drawn.filter((f) => f.afterUnit === u.code).sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id)),
    };
  });

  const remainingAll = total - done;
  const summary: JourneySummary =
    !hasMain || total === 0
      ? { kind: "none" }
      : nextFlag
        ? { kind: "toMilestone", done, total, remaining: nextFlag.remaining, title: nextFlag.title }
        : remainingAll > 0
          ? { kind: "toSummit", done, total, remaining: remainingAll }
          : { kind: "finished", done, total };

  const summitRow = confirmed.find((m) => m.role === "summit") ?? null;
  const beyond = confirmed.filter((m) => m.role === "beyond").map((m) => ({ id: m.id, title: m.title, targetMonth: m.targetMonth, approx: m.approx })).sort(byMonthThenTitle);

  return {
    hasMain,
    mainTitle: input.main?.title ?? null,
    nodes,
    climber: !hasMain || units.length === 0 ? null : climbUnit ? { at: "unit", code: climbUnit.code, kind: hereUnit ? "here" : "justDone" } : { at: "foot" },
    summary,
    summit: summitRow ? { title: summitRow.title, targetMonth: summitRow.targetMonth, approx: summitRow.approx } : null,
    beyond,
    otherMilestones: other.sort(byMonthThenTitle),
    others: input.others.map((o) => ({ ...o })),
  };
}
