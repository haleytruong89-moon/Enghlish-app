/**
 * "Bài đã giao" (24/11): every piece of work given to one child, in four tabs by what the adult has to do. Pure. Studio tests and
 * link / PDF work keep their own row types (and their own row components): only the grouping and the order are decided here.
 */
import { isOverdue } from "@/lib/practice/overdue";
import type { AssignmentView } from "@/lib/practice/types";
import { sortStudioAssigned, type StudioAssignedRow } from "@/lib/studio/assigned";

export const BOARD_TABS = ["need", "doing", "done", "removed"] as const;
export type BoardTab = (typeof BOARD_TABS)[number];
/** D-d (24/11): checked work the adult has not given feedback on is still "Cần thầy/cô xử lý". */
export const NEEDS_FEEDBACK_TO_FINISH = true;

export function tabOfStudio(r: StudioAssignedRow): BoardTab {
  if (r.status === "skipped") return "removed";
  if (r.status === "waiting") return "need";
  if (r.status === "checked") return NEEDS_FEEDBACK_TO_FINISH && r.feedbackReady && !r.feedbackGiven ? "need" : "done";
  return "doing";
}

/** Link / PDF work: retracted → removed; nothing sent → doing (a result recorded by an adult without a sending → done); sent → need until it
 *  has a result and (D-d) live feedback. */
export function tabOfPractice(a: AssignmentView): BoardTab {
  if (a.retractedAt) return "removed";
  if (a.submission === null) return a.resultId ? "done" : "doing";
  if (a.resultId === null) return "need";
  return NEEDS_FEEDBACK_TO_FINISH && !a.feedback.some((f) => f.live) ? "need" : "done";
}

export type Board = {
  counts: Record<BoardTab, number>;
  studio: Record<BoardTab, StudioAssignedRow[]>;
  practice: Record<BoardTab, AssignmentView[]>;
  /** The Studio list could not be read: the page says so instead of showing empty tabs. */
  studioFailed: boolean;
};

const empty = <T>(): Record<BoardTab, T[]> => ({ need: [], doing: [], done: [], removed: [] });

export function buildBoard(studio: readonly StudioAssignedRow[] | null, practice: readonly AssignmentView[], todayIso: string): Board {
  const s = empty<StudioAssignedRow>();
  for (const r of sortStudioAssigned(studio ?? [])) s[tabOfStudio(r)].push(r);
  const p = empty<AssignmentView>();
  for (const a of practice) p[tabOfPractice(a)].push(a);
  // Doing: overdue link / PDF work first, the oldest due day first; the rest keep the loaded order (newest first).
  const late = p.doing.filter((a) => isOverdue(a, todayIso)).sort((x, y) => (x.dueOn ?? "").localeCompare(y.dueOn ?? ""));
  p.doing = [...late, ...p.doing.filter((a) => !isOverdue(a, todayIso))];
  const counts = Object.fromEntries(BOARD_TABS.map((t) => [t, s[t].length + p[t].length])) as Record<BoardTab, number>;
  return { counts, studio: s, practice: p, studioFailed: studio === null };
}

/** The tab in the URL when it is one of the four; otherwise "need" when it has work, else "doing". */
export function parseTab(v: unknown, counts: Record<BoardTab, number>): BoardTab {
  if (typeof v === "string" && (BOARD_TABS as readonly string[]).includes(v)) return v as BoardTab;
  return counts.need > 0 ? "need" : "doing";
}
