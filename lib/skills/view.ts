/** Pure helpers of the S7a screens (no I/O). Copy comes from lib/copy/vi.ts only. */
import type { Role } from "@/lib/auth/requireAccess";
import { levelCopy, levelLabels, skillStateCopy } from "@/lib/copy/vi";
import { skillLabel } from "@/lib/review/format";
import { STATE_LEVEL, type Condition, type Route, type SkillState } from "@/lib/engine/types";
import type { DomainKey } from "@/lib/skillmap/types";
import type { SkillInbox, SkillInboxItem, SkillStateRow } from "./types";

/** The 4 labelled cells of UX §3.2 ("thang 4 ô có chữ, không dùng màu đơn thuần"). */
export const SCALE_STATES = ["SUPPORTED", "DEVELOPING", "INDEPENDENT", "TRANSFERABLE"] as const;
export function scaleCells(state: SkillState): { state: (typeof SCALE_STATES)[number]; label: string; filled: boolean; current: boolean }[] {
  const level = STATE_LEVEL[state];
  return SCALE_STATES.map((s, i) => ({ state: s, label: levelLabels[s].label, filled: level >= i + 1, current: level === i + 1 }));
}
export const stateLabel = (s: SkillState): string => levelLabels[s].label;

/** Staff name of UX §3.4 when it has one, else the catalogue's Vietnamese title, else a neutral word (never the code). */
export function skillTitle(r: { targetKey: string; titleVi: string | null }): string {
  return skillLabel(r.targetKey, r.titleVi);
}

export function conditionText(c: Condition): string {
  const label = skillStateCopy.conditions[c.id] ?? c.id;
  return c.id === "r2_accuracy" || c.id === "l2_auto_accuracy" ? skillStateCopy.percentLine(label, c.have, c.need) : skillStateCopy.conditionLine(label, c.have, c.need);
}

export const routeLabel = (route: Route | null): string | null => (route === null ? null : skillStateCopy.routeLabels[route]);

export function proposalTitle(i: SkillInboxItem): string {
  const skill = skillTitle(i);
  return i.kind === "FLAG" ? skillStateCopy.flagLine(skill, stateLabel(i.currentState)) : skillStateCopy.proposalLine(skill, stateLabel(i.fromState), stateLabel(i.toState));
}

/** The conditions shown under a proposal: those of its level (and, at level 3, of its route). A ⚑ shows its evidence only. */
export function conditionsFor(i: SkillInboxItem): Condition[] {
  if (i.kind === "FLAG") return [];
  const level = STATE_LEVEL[i.toState];
  return i.conditions.filter((c) => c.level === level && (level !== 3 || c.route === (i.route ?? 1)));
}

export const isSolid = (r: SkillStateRow): boolean => STATE_LEVEL[r.state] >= 3 && r.flag === null;
export const isPractising = (r: SkillStateRow): boolean => (STATE_LEVEL[r.state] >= 1 && STATE_LEVEL[r.state] <= 2) || r.flag !== null;

const ratio = (c: Condition) => (c.need > 0 ? c.have / c.need : 1);
/** D20 "Còn cần": the nearest unmet condition of the next level; for levels 2 and 3 (two routes, G2), inside the route with more conditions met (ties: route 1). */
export function nextNeed(r: SkillStateRow): Condition | null {
  const next = STATE_LEVEL[r.state] + 1;
  if (next > 4) return null;
  let pool = r.conditions.filter((c) => c.level === next);
  if (next === 2 || next === 3) {
    const routes = ([1, 2] as const).map((rt) => pool.filter((c) => c.route === rt)).filter((cs) => cs.length > 0);
    const metCount = (cs: Condition[]) => cs.filter((c) => c.met).length;
    pool = routes.reduce((best, cs) => (metCount(cs) > metCount(best) ? cs : best), routes[0] ?? []);
  }
  const unmet = pool.filter((c) => !c.met);
  if (unmet.length === 0) return null;
  return unmet.reduce((best, c) => (ratio(c) > ratio(best) ? c : best), unmet[0]!);
}

export type DomainSkills = {
  solid: SkillStateRow[];
  practising: SkillStateRow[];
  next: { row: SkillStateRow; need: Condition | null; pending: boolean }[];
  n: number;
  total: number;
};
export function domainSkills(rows: readonly SkillStateRow[], domain: DomainKey): DomainSkills {
  const mine = rows.filter((r) => r.domainKey === domain);
  const solid = mine.filter(isSolid);
  return {
    solid,
    practising: mine.filter(isPractising),
    next: mine.filter((r) => STATE_LEVEL[r.state] < 3).map((r) => ({ row: r, need: r.proposal ? null : nextNeed(r), pending: r.proposal !== null })),
    n: solid.length,
    total: mine.length,
  };
}
export function solidByDomain(rows: readonly SkillStateRow[]): Partial<Record<DomainKey, { n: number; total: number }>> {
  const out: Partial<Record<DomainKey, { n: number; total: number }>> = {};
  for (const r of rows) {
    if (r.domainKey === null) continue;
    const cur = out[r.domainKey] ?? { n: 0, total: 0 };
    out[r.domainKey] = { n: cur.n + (isSolid(r) ? 1 : 0), total: cur.total + 1 };
  }
  return out;
}

/** "n/N điểm đã vững" for one domain, or null when the set has no skill there. */
export const solidLine = (s: { n: number; total: number } | undefined): string | null => (s && s.total > 0 ? levelCopy.solidCount(s.n, s.total) : null);

export type InboxGroup = { learnerId: string; alias: string; isTest: boolean; canDecide: boolean; items: SkillInboxItem[]; proposalIds: string[] };
export function groupInbox(items: readonly SkillInboxItem[]): InboxGroup[] {
  const groups: InboxGroup[] = [];
  for (const i of items) {
    let g = groups.find((x) => x.learnerId === i.learnerId);
    if (!g) {
      g = { learnerId: i.learnerId, alias: i.alias, isTest: i.isTest, canDecide: false, items: [], proposalIds: [] };
      groups.push(g);
    }
    g.items.push(i);
    g.canDecide = g.canDecide || i.canDecide;
    if (i.kind === "PROPOSED" && i.canDecide) g.proposalIds.push(i.id);
  }
  return groups;
}

/** The number on the "Kỹ năng" tab: what a tutor can decide; what is open for a parent; null before migration 0023. */
export function skillTabCount(inbox: SkillInbox | null, role: Role): number | null {
  if (inbox === null) return null;
  return role === "tutor" ? inbox.decidable : inbox.open;
}

/**
 * "Còn thiếu" toward "Tự làm được" (level 3), from the conditions the engine stored with the skill state (already measured against the
 * active assessment policy: no number is written here). Two routes (G2): the route with more conditions met (ties: route 1).
 * Empty when the skill is already at level 3+, when no level-3 condition is stored yet, or when all are met.
 */
export function missingForIndependent(r: { state: SkillState; conditions: readonly Condition[] }): string[] {
  if (STATE_LEVEL[r.state] >= 3) return [];
  const pool3 = r.conditions.filter((c) => c.level === 3);
  const routes = ([1, 2] as const).map((rt) => pool3.filter((c) => c.route === rt)).filter((cs) => cs.length > 0);
  if (routes.length === 0) return [];
  const metCount = (cs: Condition[]) => cs.filter((c) => c.met).length;
  const best = routes.reduce((b, cs) => (metCount(cs) > metCount(b) ? cs : b), routes[0]!);
  return best.filter((c) => !c.met).map(conditionText);
}

export const missingText = (items: readonly string[]): string | null => (items.length === 0 ? null : skillStateCopy.missingLine(items.join(skillStateCopy.missingJoin)));

export type CriteriaRow = { id: string; descriptor_version: string; success_criteria: { check_vi?: string }[] | null };

/** Pure: per skill, the Vietnamese checks of its newest descriptor version (the rows are the seeded content/catalogue_v0.2.json). */
export function pickCriteria(rows: readonly CriteriaRow[]): Record<string, string[]> {
  const newest = new Map<string, CriteriaRow>();
  for (const r of rows) {
    const cur = newest.get(r.id);
    if (!cur || r.descriptor_version > cur.descriptor_version) newest.set(r.id, r);
  }
  const out: Record<string, string[]> = {};
  for (const [id, r] of newest) out[id] = (r.success_criteria ?? []).map((c) => c.check_vi?.trim() ?? "").filter((t) => t.length > 0);
  return out;
}

