/** Counts of the side panel "Bài sẽ tạo" (board 19) and the review order ("Chỉ câu cần xem" first). Pure. */
import { AUTO_STUDIO_KINDS, type StudioDraft, type StudioItem } from "./schema";
import type { Issue } from "./validate";

export type DraftSummary = {
  total: number;
  inApp: number;
  auto: number;
  mayNeedPerson: number;
  counted: number;
  signalOnly: number;
  paperOnly: number;
  needsReview: number;
  blocking: number;
};

export function summarizeDraft(d: StudioDraft, issues: Issue[]): DraftSummary {
  const app = d.items.filter((i) => !i.out_of_app);
  const flagged = new Set(issues.filter((x) => x.n !== null).map((x) => x.n as number));
  return {
    total: d.items.length,
    inApp: app.length,
    auto: app.filter((i) => (AUTO_STUDIO_KINDS as readonly string[]).includes(i.kind)).length,
    mayNeedPerson: app.filter((i) => !(AUTO_STUDIO_KINDS as readonly string[]).includes(i.kind)).length,
    counted: app.filter((i) => i.target_id !== null).length,
    signalOnly: app.filter((i) => i.target_id === null).length,
    paperOnly: d.items.length - app.length,
    needsReview: d.items.filter((i) => flagged.has(i.n)).length,
    blocking: issues.filter((x) => x.blocking).length,
  };
}

export function sortForReview(items: StudioItem[], issues: Issue[]): StudioItem[] {
  const flagged = new Set(issues.filter((x) => x.n !== null).map((x) => x.n as number));
  return [...items].sort((a, b) => Number(flagged.has(b.n)) - Number(flagged.has(a.n)) || a.n - b.n);
}
