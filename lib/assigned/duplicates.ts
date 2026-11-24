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
