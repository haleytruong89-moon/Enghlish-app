/** W4b · Hôm nay (plan 3.1): the order of the child's tasks, the "Làm tiếp" card, the line "còn n việc · khoảng m phút". Pure. */
import { weekdayNames } from "@/lib/copy/vi";
import type { Task } from "./types";

/** Can the child open this in the app (or in its own card)? A step with the tutor / on paper is listed but never opened. */
export function isOpenable(t: Task): boolean {
  return t.doable;
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Order: revisions first → work with a draft (newest draft first) → earliest due date (no due date last) → earliest opening date → title.
 * Not a score of any kind: it only decides what to show first.
 */
export function sortTasks(tasks: readonly Task[]): Task[] {
  const rank = (t: Task) => (t.kind === "revision" ? 0 : t.hasDraft && t.doable ? 1 : 2);
  return [...tasks].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 1) {
      const d = byText(b.draftAt ?? "", a.draftAt ?? "");
      if (d !== 0) return d;
    }
    const due = a.dueOn === b.dueOn ? 0 : a.dueOn === null ? 1 : b.dueOn === null ? -1 : byText(a.dueOn, b.dueOn);
    if (due !== 0) return due;
    return byText(a.opensOn, b.opensOn) || byText(a.title, b.title);
  });
}

export type Continue = { task: Task; /** true = "Làm tiếp" (a draft exists), false = "Việc tiếp theo". */ resume: boolean };

/** The "Làm tiếp" card: a task of the app with a draft (newest edit); none → "Việc tiếp theo" = the first openable task of the list. */
export function pickContinue(tasks: readonly Task[]): Continue | null {
  const sorted = sortTasks(tasks);
  const resumed = sorted.find((t) => t.hasDraft && t.doable && t.activityId !== null);
  if (resumed) return { task: resumed, resume: true };
  const next = sorted.find(isOpenable);
  return next ? { task: next, resume: false } : null;
}

/** "Hôm nay còn n việc · khoảng m phút": n = every task; m = the minutes that are known (link / PDF work has none); null = no minutes known. */
export function summarize(tasks: readonly Task[]): { count: number; minutes: number | null } {
  const known = tasks.map((t) => t.timeMin).filter((m): m is number => typeof m === "number" && m > 0);
  return { count: tasks.length, minutes: known.length > 0 ? known.reduce((a, b) => a + b, 0) : null };
}

/** Where a task opens. Link / PDF work opens in its own card on the same page (anchor). */
export function taskHref(t: Task): string | null {
  if (!t.doable) return null;
  if (t.assignmentId) return `#task-${t.assignmentId}`;
  return t.activityId ? `/activities/${t.activityId}` : null;
}

export function taskKey(t: Task): string {
  return t.assignmentId ?? t.activityId ?? `${t.kind}-${t.title}`;
}

/** "20/11" and the weekday of an ISO date (a plain calendar date, no time zone involved). */
export function dayParts(iso: string): { weekday: string; ddmm: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return { weekday: weekdayNames[d.getUTCDay()]!, ddmm: `${iso.slice(8, 10)}/${iso.slice(5, 7)}` };
}
