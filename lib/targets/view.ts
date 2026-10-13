/**
 * Pure helpers for the "tracked skills" page (S1). No I/O, unit-tested.
 * The page shows the learner's CURRENT target set; tracking-only items are listed apart and
 * are never part of the denominator.
 */
import { levelLabels, skillNames } from "@/lib/copy/vi";

export type TargetSetAssignment = { definitionId: string; effectiveFrom: Date; seq: number };

/** Current set = latest `effective_from <= now`; ties broken by `seq` (the DB's monotonic insert order). */
export function pickCurrentAssignment<T extends TargetSetAssignment>(rows: T[], now: Date): T | null {
  const eligible = rows.filter((r) => r.effectiveFrom.getTime() <= now.getTime());
  eligible.sort(
    (a, b) =>
      b.effectiveFrom.getTime() - a.effectiveFrom.getTime() || b.seq - a.seq,
  );
  return eligible[0] ?? null;
}

export type DefinitionInput = {
  id: string;
  version: number;
  descriptorVersion: string;
  catalogueVersion: string;
  targetIds: string[];
  trackingOnly: { dimensions: string[]; aggregates: string[] };
};
export type TargetInput = { id: string; titleVi: string; dimensionId: string };
export type DimensionInput = { id: string; nameVi: string };
export type AggregateInput = { id: string; definitionVi: string };

export type TargetRow = {
  id: string;
  title: string;
  dimensionName: string;
  /** Level label. Always "not enough work yet" in S1 (no states exist). */
  levelLabel: string;
};
export type TrackingOnlyRow = { id: string; label: string };

export type TargetsView = {
  setId: string;
  version: number;
  descriptorVersion: string;
  catalogueVersion: string;
  rows: TargetRow[];
  trackingOnly: TrackingOnlyRow[];
};

/** Staff-facing name: UX_COPY_GUIDE §3.4 when it has one, else the catalogue's Vietnamese title. */
export function targetTitle(target: TargetInput): string {
  return skillNames[target.id]?.staff ?? target.titleVi;
}

export function buildTargetsView(
  def: DefinitionInput,
  targets: TargetInput[],
  dimensions: DimensionInput[],
  aggregates: AggregateInput[],
): TargetsView {
  const targetById = new Map(targets.map((t) => [t.id, t]));
  const dimById = new Map(dimensions.map((d) => [d.id, d]));
  const aggById = new Map(aggregates.map((a) => [a.id, a]));

  const rows: TargetRow[] = [];
  for (const id of def.targetIds) {
    const t = targetById.get(id);
    if (!t) continue; // cannot happen (DB trigger checks); never show a half-built row
    rows.push({
      id,
      title: targetTitle(t),
      dimensionName: dimById.get(t.dimensionId)?.nameVi ?? "",
      levelLabel: levelLabels.NOT_OBSERVED.label,
    });
  }

  const trackingOnly: TrackingOnlyRow[] = [
    ...def.trackingOnly.dimensions.flatMap((id) => {
      const d = dimById.get(id);
      return d ? [{ id, label: d.nameVi }] : [];
    }),
    ...def.trackingOnly.aggregates.flatMap((id) => {
      const a = aggById.get(id);
      return a ? [{ id, label: a.definitionVi }] : [];
    }),
  ];

  return {
    setId: def.id,
    version: def.version,
    descriptorVersion: def.descriptorVersion,
    catalogueVersion: def.catalogueVersion,
    rows,
    trackingOnly,
  };
}
