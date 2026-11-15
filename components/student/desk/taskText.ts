import { activityLabels, fallbackLabels, studentDeskCopy as c, work } from "@/lib/copy/vi";
import { dayParts } from "@/lib/student/today";
import type { Task } from "@/lib/student/types";

export const kindLabel = (t: Task): string => c.kinds[t.kind];

/** A topic step reads "title · what to do"; a Studio set, a link / PDF and a revision are just their title. */
export function taskTitle(t: Task): string {
  if (t.kind === "topic" && t.activityType) return `${t.title} · ${activityLabels[t.activityType] ?? fallbackLabels.activity}`;
  return t.title;
}

/** "Hạn Thứ Sáu 20/11" (or "Không có hạn") — dates are plain calendar days of the child's week, never a "late" mark (D4). */
export function dueText(dueOn: string | null): { text: string; iso: string | null } {
  const p = dueOn ? dayParts(dueOn) : null;
  return p ? { text: c.due(p.weekday, p.ddmm), iso: dueOn } : { text: c.noDue, iso: null };
}

/** What a step the app cannot do shows instead of an "open" button. */
export const offLabelText = (t: Task): string | null => (t.offLabel ? work.statusLabels[t.offLabel] : null);
