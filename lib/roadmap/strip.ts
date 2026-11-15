/**
 * The "đường lên đỉnh" preview strip of the tutor page (plan A-extra E): the Units of the main curriculum as small dots by state, flags
 * at their Unit (confirmed = solid, draft = dashed), the summit at the end. Pure: the Unit states come from the Giáo trình
 * (read-only here). Removed milestones and milestones of another curriculum are not drawn; flags without a Unit are listed apart.
 */
import type { RoadmapCurriculum, UnitState } from "./shape";
import type { MilestoneCard, MilestoneKind } from "./types";

export type StripFlag = { milestoneId: string; kind: MilestoneKind; title: string; draft: boolean };
export type StripCell = { code: string; ord: number; title: string; state: UnitState; flags: StripFlag[] };
export type Strip = {
  curriculumTitle: string;
  cells: StripCell[];
  summit: { title: string; draft: boolean } | null;
  counts: Record<UnitState, number>;
  /** Flags of the main curriculum that are not attached to a Unit (not drawn on the strip). */
  unplaced: StripFlag[];
  flagCount: number;
};

export function buildStrip(mainId: string | null, curricula: readonly RoadmapCurriculum[], cards: readonly MilestoneCard[]): Strip | null {
  const main = mainId ? curricula.find((c) => c.id === mainId) : undefined;
  if (!main) return null;
  const live = cards.filter((c) => c.current.status !== "removed");
  const toFlag = (c: MilestoneCard): StripFlag => ({ milestoneId: c.milestoneId, kind: c.current.kind, title: c.current.title, draft: c.current.status === "draft" });
  const flags = live.filter((c) => c.current.role === "flag" && (c.current.curriculumId === main.id || c.current.curriculumId === null));
  const onUnit = new Map<string, StripFlag[]>();
  const unplaced: StripFlag[] = [];
  const codes = new Set(main.units.map((u) => u.code));
  for (const c of flags) {
    const code = c.current.afterUnit;
    if (code !== null && c.current.curriculumId === main.id && codes.has(code)) onUnit.set(code, [...(onUnit.get(code) ?? []), toFlag(c)]);
    else unplaced.push(toFlag(c));
  }
  const counts: Record<UnitState, number> = { done: 0, in_progress: 0, not_started: 0, skipped: 0 };
  const cells = [...main.units].sort((a, b) => a.ord - b.ord).map((u): StripCell => {
    const state = main.unitStates[u.code] ?? "not_started";
    counts[state] += 1;
    return { code: u.code, ord: u.ord, title: u.title, state, flags: onUnit.get(u.code) ?? [] };
  });
  // the summit the child sees wins; else a (draft) summit the tutor is preparing
  const summitCard = live.find((c) => c.childSees?.role === "summit") ?? live.find((c) => c.current.role === "summit");
  return {
    curriculumTitle: main.title, cells, counts,
    summit: summitCard ? { title: summitCard.current.title, draft: summitCard.current.status === "draft" } : null,
    unplaced, flagCount: flags.length - unplaced.length,
  };
}
