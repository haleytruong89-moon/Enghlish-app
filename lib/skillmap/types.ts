/**
 * Skill map (spec docs/superpowers/specs/2026-10-21-skill-map-levels-design.md §2): 7 fixed domains → 40 groups → leaves.
 * A leaf is a seed tag of one track (signal) or a catalogue target (evidence). Shared by both children and every level.
 */
export const DOMAIN_KEYS = ["grammar", "vocab", "reading", "listening", "writing", "speaking", "thinking"] as const;
export type DomainKey = (typeof DOMAIN_KEYS)[number];

/** The 9 steps of P2-b. The thinking domain uses task levels 1–4 instead. */
export const CEFR_LEVELS = ["A1", "A2", "A2+", "B1", "B1+", "B2", "B2+", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** Keys of a CEFR group's descriptions ("ví dụ nội dung theo cấp"). Thinking groups use {low, high}. */
export const LEVEL_BANDS = ["A1-A2", "B1", "B2", "C1-C2"] as const;

/** Same rule as the SQL checks on skill_groups.key and error_tags.group_key (migration 0019). */
export const GROUP_KEY_RE = /^[a-z]{2}-[a-z-]{2,30}$/;

/** Bucket of items without a group in the map (family tags added before SM-1, unknown keys). */
export const UNASSIGNED = "unassigned" as const;
export type BucketKey = DomainKey | typeof UNASSIGNED;

export function isDomainKey(k: string): k is DomainKey {
  return (DOMAIN_KEYS as readonly string[]).includes(k);
}

export type LeafKind = "tag" | "target";

export type SkillLeaf = {
  kind: LeafKind;
  trackId: string;
  /** Tag key (error_tags.key) or target id (targets.id). */
  refKey: string;
  label: string;
  levelFrom: CefrLevel | null;
  levelTo: CefrLevel | null;
  taskFrom: number | null;
  taskTo: number | null;
  core: boolean;
  hiddenInPicker: boolean;
  /** Target ids a tag is "related" to (spec §2 rule 4). */
  related: string[];
  /** A family's own tag ("Nhãn riêng"). */
  custom: boolean;
  /** Target in the learner's current target set. Always false for tags. */
  inSet: boolean;
};

export type SkillGroup = { key: string; name: string; descriptions: Record<string, string | null>; leaves: SkillLeaf[] };
export type SkillDomain = { key: DomainKey; name: string; scale: "cefr" | "task_level"; groups: SkillGroup[] };

/** The published map as one learner sees it (eng_skill_map): tags of the learner's track + the family's own, every target. */
export type SkillMapView = {
  mapId: string;
  trackId: string;
  /** Assumed start level per domain for the learner's track (SM-2 shows it as "giả định — chờ cô xác nhận"). */
  assumed: Record<string, string | number>;
  domains: SkillDomain[];
  /** Tags of this learner's track (seed or family) that have no group in the map. */
  unassigned: SkillLeaf[];
  /** SM-2 (P4-c): the child's current level per domain ("B1+", task level "2"). Absent = pickers do not sort by level. */
  current?: Partial<Record<DomainKey, string>>;
};
