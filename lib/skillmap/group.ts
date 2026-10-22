/**
 * Pure grouping of picker items and weak points by the skill map (no React, no database): used by the pickers (client) and the
 * weak-points page (server). Spec 2026-10-21 §5 (SM-1 rows) and P4-c (SM-2): tag pickers put the items around the child's current level
 * (± 1 level, D1) in `groups` and the others in `far`, shown collapsed. Skills of the child's set and weak points are never split (D2).
 */
import { skillMapCopy } from "@/lib/copy/vi";
import type { TagInfo, WeakPoint } from "@/lib/tutorwork/types";
import { nearLevel } from "@/lib/levels/scale";
import { UNASSIGNED, type BucketKey, type DomainKey, type SkillLeaf, type SkillMapView } from "./types";

export type GroupPlace = {
  domainKey: DomainKey;
  domainName: string;
  scale: "cefr" | "task_level";
  groupKey: string;
  groupName: string;
  hidden: boolean;
  /** The leaf of the map (null for a group found through a family tag's own group key). */
  leaf: SkillLeaf | null;
};
export type BucketGroup<T> = { key: string; name: string; items: T[] };
/** `groups` = around the current level (or everything when no level is known); `far` = other levels. `total` counts both. */
export type Bucket<T> = { key: BucketKey; name: string; total: number; groups: BucketGroup<T>[]; far: BucketGroup<T>[] };
export type WeakTile = { key: BucketKey; name: string; weakCount: number; worst: WeakPoint | null; points: WeakPoint[] };

type Index = { groups: Map<string, GroupPlace>; tags: Map<string, GroupPlace>; targets: Map<string, GroupPlace> };
const cache = new WeakMap<SkillMapView, Index>();

function index(map: SkillMapView): Index {
  const hit = cache.get(map);
  if (hit) return hit;
  const out: Index = { groups: new Map(), tags: new Map(), targets: new Map() };
  for (const d of map.domains)
    for (const g of d.groups) {
      const base = { domainKey: d.key, domainName: d.name, scale: d.scale, groupKey: g.key, groupName: g.name };
      out.groups.set(g.key, { ...base, hidden: false, leaf: null });
      for (const l of g.leaves) (l.kind === "tag" ? out.tags : out.targets).set(l.refKey, { ...base, hidden: l.hiddenInPicker, leaf: l });
    }
  cache.set(map, out);
  return out;
}

export function placeOfGroup(map: SkillMapView, groupKey: string): GroupPlace | null {
  return index(map).groups.get(groupKey) ?? null;
}

/** A family tag's own group wins (it may have been added after the page loaded); a seed tag uses its leaf of the learner's track. */
export function placeOfTag(map: SkillMapView, tag: { key: string; groupKey?: string | null }): GroupPlace | null {
  if (tag.groupKey) return placeOfGroup(map, tag.groupKey);
  return index(map).tags.get(tag.key) ?? null;
}

export function placeOfTarget(map: SkillMapView, id: string): GroupPlace | null {
  return index(map).targets.get(id) ?? null;
}

/** The domain a tag just added (or matched to an existing one) sits in: the group the SERVER returned, else the tag's own place. */
export function domainOfAdded(map: SkillMapView, added: { key: string; groupKey?: string | null }): DomainKey | null {
  return placeOfTag(map, added)?.domainKey ?? null;
}

export function domainOfGroup(map: SkillMapView, groupKey: string): DomainKey | null {
  return placeOfGroup(map, groupKey)?.domainKey ?? null;
}

function bucketize<T>(
  map: SkillMapView,
  items: T[],
  placeOf: (item: T) => GroupPlace | null,
  opts: { keep: (item: T) => boolean; nearKeep?: (item: T) => boolean; byLevel: boolean },
): Bucket<T>[] {
  const domains = map.domains.map((d) => ({
    key: d.key as BucketKey,
    name: d.name,
    total: 0,
    groups: d.groups.map((g) => ({ key: g.key, name: g.name, items: [] as T[] })),
    far: d.groups.map((g) => ({ key: g.key, name: g.name, items: [] as T[] })),
  }));
  const loose: T[] = [];
  for (const item of items) {
    const p = placeOf(item);
    if (!p) {
      loose.push(item);
      continue;
    }
    const kept = opts.keep(item);
    if (p.hidden && !kept) continue;
    const d = domains.find((x) => x.key === p.domainKey);
    const gi = d ? d.groups.findIndex((x) => x.key === p.groupKey) : -1;
    if (!d || gi < 0) {
      loose.push(item);
      continue;
    }
    const near = !opts.byLevel || (opts.nearKeep ?? opts.keep)(item) || p.leaf === null || nearLevel(p.scale, map.current?.[p.domainKey], p.leaf);
    (near ? d.groups : d.far)[gi]!.items.push(item);
    d.total += 1;
  }
  const out: Bucket<T>[] = domains.map((d) => ({
    ...d,
    groups: d.groups.filter((g) => g.items.length > 0),
    far: d.far.filter((g) => g.items.length > 0),
  }));
  if (loose.length > 0) {
    out.push({
      key: UNASSIGNED, name: skillMapCopy.unassigned, total: loose.length,
      groups: [{ key: UNASSIGNED, name: skillMapCopy.unassigned, items: loose }], far: [],
    });
  }
  return out;
}

/**
 * `keep` = tags that stay listed even when hidden in the picker (and count as near). `nearKeep`, when given, replaces `keep` for the
 * near/far split only: the chips pass the selection at mount, so a far chip ticked in this session stays in its section.
 */
export function groupTags(map: SkillMapView, tags: TagInfo[], opts: { keep?: string[]; nearKeep?: string[] } = {}): Bucket<TagInfo>[] {
  const keep = new Set(opts.keep ?? []);
  const nearKeep = opts.nearKeep ? new Set(opts.nearKeep) : undefined;
  return bucketize(map, tags, (t) => placeOfTag(map, t), { keep: (t) => keep.has(t.key), nearKeep: nearKeep && ((t) => nearKeep.has(t.key)), byLevel: true });
}

export function groupTargets<T extends { id: string }>(map: SkillMapView, items: T[]): Bucket<T>[] {
  return bucketize(map, items, (t) => placeOfTarget(map, t.id), { keep: () => true, byLevel: false });
}

export function groupWeakPoints(map: SkillMapView, points: WeakPoint[]): WeakTile[] {
  return bucketize(map, points, (p) => placeOfTag(map, { key: p.tagKey }), { keep: () => true, byLevel: false }).map((b) => {
    const all = b.groups.flatMap((g) => g.items);
    // keep the order of eng_weak_points (worst first), not the group order
    const ordered = points.filter((p) => all.includes(p));
    const weak = ordered.filter((p) => p.status !== "ok");
    return { key: b.key, name: b.name, weakCount: weak.length, worst: weak[0] ?? null, points: ordered };
  });
}

export function firstTab<T>(buckets: Bucket<T>[], prefer?: (item: T) => boolean): BucketKey {
  if (prefer) {
    const hit = buckets.find((b) => [...b.groups, ...b.far].some((g) => g.items.some(prefer)));
    if (hit) return hit.key;
  }
  return (buckets.find((b) => b.total > 0) ?? buckets[0])?.key ?? "grammar";
}
