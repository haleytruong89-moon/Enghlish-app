import "server-only";
import { createUserClient } from "@/lib/supabase/server";
import {
  buildTargetsView,
  pickCurrentAssignment,
  type AggregateInput,
  type DefinitionInput,
  type DimensionInput,
  type TargetInput,
  type TargetsView,
} from "./view";

type AssignmentRow = { definition_id: string; effective_from: string; seq: number };
type DefinitionRow = {
  id: string;
  version: number;
  descriptor_version: string;
  catalogue_version: string;
  target_ids: string[];
  tracking_only: { dimensions?: string[]; aggregates?: string[] };
};
type TargetRow = { id: string; title_vi: string; dimension_id: string };
type DimensionRow = { id: string; name_vi: string };
type AggregateRow = { id: string; definition_vi: string };

/**
 * Read the learner's current target set with the USER client, so RLS applies on top of
 * requireAccess (call that first). Returns null when no set has been assigned yet.
 */
export async function loadTargetsView(learnerId: string, now: Date = new Date()): Promise<TargetsView | null> {
  const db = await createUserClient();

  const { data: assignments, error: aErr } = await db
    .from("target_sets")
    .select("definition_id, effective_from, seq")
    .eq("learner_id", learnerId)
    .returns<AssignmentRow[]>();
  if (aErr) throw new Error(`target_sets lookup failed: ${aErr.code}`);

  const current = pickCurrentAssignment(
    (assignments ?? []).map((r) => ({
      definitionId: r.definition_id,
      effectiveFrom: new Date(r.effective_from),
      seq: Number(r.seq),
    })),
    now,
  );
  if (!current) return null;

  const { data: defRow, error: dErr } = await db
    .from("target_set_definitions")
    .select("id, version, descriptor_version, catalogue_version, target_ids, tracking_only")
    .eq("id", current.definitionId)
    .maybeSingle<DefinitionRow>();
  if (dErr) throw new Error(`target_set_definitions lookup failed: ${dErr.code}`);
  if (!defRow) return null;

  const def: DefinitionInput = {
    id: defRow.id,
    version: defRow.version,
    descriptorVersion: defRow.descriptor_version,
    catalogueVersion: defRow.catalogue_version,
    targetIds: defRow.target_ids,
    trackingOnly: {
      dimensions: defRow.tracking_only.dimensions ?? [],
      aggregates: defRow.tracking_only.aggregates ?? [],
    },
  };

  const [targetsRes, dimsRes, aggRes] = await Promise.all([
    db
      .from("targets")
      .select("id, title_vi, dimension_id")
      .eq("descriptor_version", def.descriptorVersion)
      .in("id", def.targetIds)
      .returns<TargetRow[]>(),
    db
      .from("dimensions")
      .select("id, name_vi")
      .eq("catalogue_version", def.catalogueVersion)
      .returns<DimensionRow[]>(),
    def.trackingOnly.aggregates.length
      ? db
          .from("aggregate_indicators")
          .select("id, definition_vi")
          .eq("catalogue_version", def.catalogueVersion)
          .in("id", def.trackingOnly.aggregates)
          .returns<AggregateRow[]>()
      : Promise.resolve({ data: [] as AggregateRow[], error: null }),
  ]);
  if (targetsRes.error) throw new Error(`targets lookup failed: ${targetsRes.error.code}`);
  if (dimsRes.error) throw new Error(`dimensions lookup failed: ${dimsRes.error.code}`);
  if (aggRes.error) throw new Error(`aggregate_indicators lookup failed: ${aggRes.error.code}`);

  const targets: TargetInput[] = (targetsRes.data ?? []).map((t) => ({
    id: t.id,
    titleVi: t.title_vi,
    dimensionId: t.dimension_id,
  }));
  const dimensions: DimensionInput[] = (dimsRes.data ?? []).map((d) => ({ id: d.id, nameVi: d.name_vi }));
  const aggregates: AggregateInput[] = (aggRes.data ?? []).map((a) => ({ id: a.id, definitionVi: a.definition_vi }));

  return buildTargetsView(def, targets, dimensions, aggregates);
}
