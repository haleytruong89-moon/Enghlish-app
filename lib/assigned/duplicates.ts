/** "Giao trùng" (24/11): a warning only — giving the same work twice stays allowed (a retry on purpose is legitimate). Pure. */
import type { AssignmentView } from "@/lib/practice/types";
import type { StudioAssignedRow } from "@/lib/studio/assigned";
import { tabOfPractice, tabOfStudio } from "./board";

/** Case, spaces and the separators people type differently ("C1, C2 - Unit 15" = "c1 c2 · unit 15") do not matter. */
export const normTitle = (t: string): string =>
  t.normalize("NFC").toLowerCase().replace(/[·,\-–—:|/]+/g, " ").replace(/\s+/g, " ").trim();

/** Titles of work the child has not sent and that was not removed (tab "Con đang làm"), normalized. */
export function openTitles(studio: readonly StudioAssignedRow[] | null, practice: readonly AssignmentView[]): string[] {
  return [
    ...(studio ?? []).filter((r) => tabOfStudio(r) === "doing").map((r) => normTitle(r.title)),
    ...practice.filter((a) => tabOfPractice(a) === "doing").map((a) => normTitle(a.title)),
  ];
}

export const isDuplicate = (title: string, open: readonly string[]): boolean => {
  const t = normTitle(title);
  return t.length > 0 && open.includes(t);
};

/** Q6 (audit 25/11): an overdue test is "long late" after this many days past its due day. */
export const LONG_LATE_DAYS = 7;

/**
 * Q6 (audit 25/11): overdue Studio tests that look given by mistake — another test with the same title was already sent by the child,
 * or was given earlier and is still open. Returns their instance ids. A hint only: the adult decides and removes ("Gỡ bài"). Pure.
 */
export function likelyDuplicates(rows: readonly StudioAssignedRow[]): Set<string> {
  const out = new Set<string>();
  const live = rows.filter((r) => r.status !== "skipped");
  for (const r of live) {
    if (r.status !== "overdue") continue;
    const t = normTitle(r.title);
    if (!t) continue;
    const twin = live.some((o) => o.instanceId !== r.instanceId && normTitle(o.title) === t && (o.attempts > 0 || o.assignedAt < r.assignedAt || (o.assignedAt === r.assignedAt && o.instanceId < r.instanceId)));
    if (twin) out.add(r.instanceId);
  }
  return out;
}

export type OverdueFacts = { overdue: number; duplicates: number; longLate: number };

/** What the desk says about overdue Studio tests (Q6). Pure. */
export function overdueFacts(rows: readonly StudioAssignedRow[]): OverdueFacts {
  const late = rows.filter((r) => r.status === "overdue");
  return { overdue: late.length, duplicates: likelyDuplicates(rows).size, longLate: late.filter((r) => (r.lateDays ?? 0) > LONG_LATE_DAYS).length };
}
