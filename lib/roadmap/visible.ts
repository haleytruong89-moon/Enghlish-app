/**
 * "Bản mới nhất thắng" for milestones (plan §3.4). Pure. Rows are versions of many milestones, in any order.
 *   - current version of a milestone = the highest `version`;
 *   - the child sees the current version when it is confirmed; nothing when it is removed;
 *   - when the current version is a draft, the child sees the latest confirmed version BEFORE it (if any), else nothing.
 */
import type { MilestoneCard, MilestoneVersion } from "./types";

export function groupByMilestone(rows: readonly MilestoneVersion[]): Map<string, MilestoneVersion[]> {
  const out = new Map<string, MilestoneVersion[]>();
  for (const r of rows) {
    const list = out.get(r.milestoneId);
    if (list) list.push(r);
    else out.set(r.milestoneId, [r]);
  }
  for (const list of out.values()) list.sort((a, b) => a.version - b.version);
  return out;
}

/** The version of one milestone that the child sees (versions of ONE milestone, any order). */
export function childVersion(versions: readonly MilestoneVersion[]): MilestoneVersion | null {
  const sorted = [...versions].sort((a, b) => b.version - a.version);
  const cur = sorted[0];
  if (!cur) return null;
  if (cur.status === "confirmed") return cur;
  if (cur.status === "removed") return null;
  return sorted.find((v) => v.version < cur.version && v.status === "confirmed") ?? null;
}

export function buildCards(rows: readonly MilestoneVersion[]): MilestoneCard[] {
  const cards: MilestoneCard[] = [];
  for (const [milestoneId, versions] of groupByMilestone(rows)) {
    const current = versions[versions.length - 1] as MilestoneVersion;
    const childSees = childVersion(versions);
    cards.push({ milestoneId, current, childSees, childSeesOlder: current.status === "draft" && childSees !== null, history: [...versions].reverse() });
  }
  return cards.sort((a, b) => (a.current.createdAt < b.current.createdAt ? -1 : a.current.createdAt > b.current.createdAt ? 1 : a.milestoneId.localeCompare(b.milestoneId)));
}

/** Milestones whose current version is a draft (waiting for the tutor to confirm). Removed and confirmed ones are not waiting. */
export const draftCards = (cards: readonly MilestoneCard[]): MilestoneCard[] => cards.filter((c) => c.current.status === "draft");

/** The summit the child sees now (at most one is allowed; the first by creation if data ever had two). */
export function summitOf(cards: readonly MilestoneCard[]): MilestoneVersion | null {
  return cards.map((c) => c.childSees).find((v): v is MilestoneVersion => v !== null && v.role === "summit") ?? null;
}
