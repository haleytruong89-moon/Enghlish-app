/** Pure grouping of the point inbox for the "Kỹ năng" review tab (one group per child, children by name). */
import type { PointInboxItem } from "./types";

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
