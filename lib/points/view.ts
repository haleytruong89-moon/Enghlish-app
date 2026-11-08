/** Pure grouping and wording of the point inbox for the "Kỹ năng" review tab (one group per child, children by name). */
import type { Role } from "@/lib/auth/requireAccess";
import { pointMapCopy, pointStateCopy } from "@/lib/copy/vi";
import { STATE_LEVEL, type PointCondition, type PointState } from "@/lib/engine/points/types";
import type { SkillInbox } from "@/lib/skills/types";
import type { InboxGroup } from "@/lib/skills/view";
import type { PointInbox, PointInboxItem, PointMapRow } from "./types";

export type PointInboxGroup = { learnerId: string; alias: string; isTest: boolean; canDecide: boolean; items: PointInboxItem[] };

export function groupPointInbox(items: readonly PointInboxItem[]): PointInboxGroup[] {
  const groups: PointInboxGroup[] = [];
  for (const i of items) {
    let g = groups.find((x) => x.learnerId === i.learnerId);
    if (!g) {
      g = { learnerId: i.learnerId, alias: i.alias, isTest: i.isTest, canDecide: false, items: [] };
      groups.push(g);
    }
    g.items.push(i);
    g.canDecide = g.canDecide || i.canDecide;
  }
  return groups.sort((a, b) => a.alias.localeCompare(b.alias, "vi"));
}

// ---- Text and numbers for the cards and the map (every word from lib/copy/vi.ts) ---------------------------------------------------

export const pointLevel = (s: PointState): string => pointMapCopy.levels[s];

export function pointTitle(i: PointInboxItem): string {
  const name = i.titleVi ?? i.tagKey;
  return i.kind === "FLAG" ? pointStateCopy.flagLine(name, pointLevel(i.currentState)) : pointStateCopy.proposalLine(name, pointLevel(i.fromState), pointLevel(i.toState));
}

/** The conditions of the level a proposal asks for (a ⚑ shows its evidence only). */
export function pointConditionsFor(i: PointInboxItem): PointCondition[] {
  if (i.kind === "FLAG") return [];
  const level = STATE_LEVEL[i.toState];
  return i.conditions.filter((c) => c.level === level);
}

export function pointConditionText(c: PointCondition): string {
  const label = pointStateCopy.conditions[c.id] ?? c.id;
  return c.id === "l3_accuracy" ? `${label}: ${c.have} % / ${c.need} %` : `${label}: ${c.have}/${c.need}`;
}

/** The number on the "Kỹ năng" tab: skills plus points (what a tutor can decide; what is open for a parent). null only when neither could be read. */
export function combinedTabCount(skills: SkillInbox | null, points: PointInbox | null, role: Role): number | null {
  if (skills === null && points === null) return null;
  const pick = (x: { open: number; decidable: number } | null) => (x === null ? 0 : role === "tutor" ? x.decidable : x.open);
  return pick(skills) + pick(points);
}

// ---- Bản đồ kiến thức: mảng › nhóm › điểm ----------------------------------------------------------------------------------------
export type MapGroup = { key: string; name: string; points: PointMapRow[] };
export type MapDomain = { key: string; name: string; groups: MapGroup[] };

/** Gathers the points in the order the database sent them (mảng, then nhóm, then name). A point with no place goes under "Chưa xếp". */
export function groupPointMap(points: readonly PointMapRow[]): MapDomain[] {
  const domains: MapDomain[] = [];
  for (const p of points) {
    const dKey = p.domainKey ?? "-";
    let d = domains.find((x) => x.key === dKey);
    if (!d) {
      d = { key: dKey, name: p.domainVi ?? pointMapCopy.noDomain, groups: [] };
      domains.push(d);
    }
    const gKey = p.groupKey ?? "-";
    let g = d.groups.find((x) => x.key === gKey);
    if (!g) {
      g = { key: gKey, name: p.groupVi ?? pointMapCopy.noGroup, points: [] };
      d.groups.push(g);
    }
    g.points.push(p);
  }
  return domains;
}

/** The 4 cells of the scale (UX §3.2): which are filled for a state, and the one that is current. */
export function pointScaleCells(state: PointState): { state: PointState; label: string; filled: boolean; current: boolean }[] {
  const level = STATE_LEVEL[state];
  return (["SUPPORTED", "DEVELOPING", "INDEPENDENT", "TRANSFERABLE"] as const).map((s) => ({
    state: s, label: pointMapCopy.levels[s], filled: STATE_LEVEL[s] <= level, current: s === state,
  }));
}

// ---- One child, both kinds ("Kỹ năng" tab = skills + knowledge points, R1) ------------------------------------------------------
export type MergedGroup = {
  learnerId: string;
  alias: string;
  isTest: boolean;
  skills: InboxGroup | null;
  points: PointInboxGroup | null;
  total: number;
};

/** Skill groups keep their order; children that only have point proposals follow. */
export function mergeInboxGroups(skills: readonly InboxGroup[], points: readonly PointInboxGroup[]): MergedGroup[] {
  const out: MergedGroup[] = skills.map((s) => ({ learnerId: s.learnerId, alias: s.alias, isTest: s.isTest, skills: s, points: null, total: s.items.length }));
  for (const p of points) {
    const hit = out.find((g) => g.learnerId === p.learnerId);
    if (hit) {
      hit.points = p;
      hit.total += p.items.length;
    } else out.push({ learnerId: p.learnerId, alias: p.alias, isTest: p.isTest, skills: null, points: p, total: p.items.length });
  }
  return out;
}
