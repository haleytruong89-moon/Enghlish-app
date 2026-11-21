/**
 * Bản rà 21/11 #10: Units of work the child has SENT (a Studio test given with Units, 0037; a link / PDF given with Units, 0029) that are
 * still "Chưa bắt đầu" → the Giáo trình page proposes "Đang học" (DOMAIN §5.1: the app only proposes; the adult clicks). Pure.
 * Never "Đã học": coverage counts only units the adult marked done.
 */
import type { UnitStatus } from "./types";

export type SentWorkUnit = { curriculumId: string; unitCode: string; title: string; sentAt: string };
export type WorkProposal = { code: string; titles: string[]; lastSentAt: string };

export function proposeFromSentWork(curriculumId: string, rows: readonly SentWorkUnit[], statusOf: Readonly<Record<string, UnitStatus>>): WorkProposal[] {
  const by = new Map<string, WorkProposal>();
  for (const r of rows) {
    if (r.curriculumId !== curriculumId) continue;
    // Only Units of the version in use that have not started (a unit dropped in a later version has no status here).
    if (statusOf[r.unitCode] !== "not_started") continue;
    const p = by.get(r.unitCode) ?? { code: r.unitCode, titles: [], lastSentAt: r.sentAt };
    if (!p.titles.includes(r.title)) p.titles.push(r.title);
    if (r.sentAt > p.lastSentAt) p.lastSentAt = r.sentAt;
    by.set(r.unitCode, p);
  }
  return [...by.values()].sort((a, b) => (a.lastSentAt < b.lastSentAt ? 1 : a.lastSentAt > b.lastSentAt ? -1 : a.code.localeCompare(b.code)));
}
