/** Parse the jsonb of english.eng_skill_map (migration 0019). zod strips unknown keys; anything unexpected throws (→ 500, logged). */
import { z } from "zod";
import { CEFR_LEVELS, DOMAIN_KEYS, type SkillLeaf, type SkillMapView } from "./types";

const leafRow = z.object({
  kind: z.enum(["tag", "target"]),
  track_id: z.string(),
  ref_key: z.string(),
  label_vi: z.string(),
  level_from: z.enum(CEFR_LEVELS).nullable(),
  level_to: z.enum(CEFR_LEVELS).nullable(),
  task_from: z.number().int().nullable(),
  task_to: z.number().int().nullable(),
  core: z.boolean(),
  hidden_in_picker: z.boolean(),
  related: z.array(z.string()),
  custom: z.boolean(),
  in_set: z.boolean(),
});
const mapRow = z.object({
  map_id: z.string(),
  track_id: z.string(),
  assumed: z.record(z.string(), z.union([z.string(), z.number()])),
  domains: z.array(
    z.object({
      key: z.enum(DOMAIN_KEYS),
      name_vi: z.string(),
      scale: z.enum(["cefr", "task_level"]),
      groups: z.array(z.object({ key: z.string(), name_vi: z.string(), desc: z.record(z.string(), z.string().nullable()), leaves: z.array(leafRow) })),
    }),
  ),
  unassigned: z.array(leafRow),
});

const toLeaf = (l: z.infer<typeof leafRow>): SkillLeaf => ({
  kind: l.kind, trackId: l.track_id, refKey: l.ref_key, label: l.label_vi, levelFrom: l.level_from, levelTo: l.level_to,
  taskFrom: l.task_from, taskTo: l.task_to, core: l.core, hiddenInPicker: l.hidden_in_picker, related: l.related, custom: l.custom, inSet: l.in_set,
});

export function parseSkillMap(raw: unknown): SkillMapView {
  const m = mapRow.parse(raw);
  return {
    mapId: m.map_id,
    trackId: m.track_id,
    assumed: m.assumed,
    domains: m.domains.map((d) => ({
      key: d.key,
      name: d.name_vi,
      scale: d.scale,
      groups: d.groups.map((g) => ({ key: g.key, name: g.name_vi, descriptions: g.desc, leaves: g.leaves.map(toLeaf) })),
    })),
    unassigned: m.unassigned.map(toLeaf),
  };
}
