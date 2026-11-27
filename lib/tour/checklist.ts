/**
 * "Bắt đầu với An" (27/11): the first things a tutor does for a child, each ticked from what is really in the app (no SQL, no flag
 * the adult sets). Pure. `null` = that fact could not be read: the item is shown as unknown, never as done or not done.
 */
import type { BoardTab } from "@/lib/assigned/board";
import type { CurriculumCard } from "@/lib/curriculum/shape";
import type { LevelProfile } from "@/lib/levels/types";
import type { SessionDay } from "@/lib/sessions/types";

export type StartKey = "levels" | "curriculum" | "unit" | "assign" | "feedback" | "session";
export type StartItem = { key: StartKey; done: boolean | null; href: string };
export type StartFacts = {
  profile: LevelProfile | null;
  curricula: CurriculumCard[] | null;
  assigned: Record<BoardTab, number> | null | undefined;
  /** Link / PDF work given (Hôm nay's practice list); null = unknown. */
  practiceGiven: number | null;
  sessions: SessionDay[] | null;
};

const known = <T,>(v: T | null | undefined): v is T => v !== null && v !== undefined;

export function startChecklist(learnerId: string, f: StartFacts): StartItem[] {
  const base = `/learners/${learnerId}`;
  const approved = known(f.curricula) ? f.curricula.filter((c) => c.current !== null) : null;
  const given = known(f.assigned) ? f.assigned.need + f.assigned.doing + f.assigned.done + f.assigned.removed : null;
  return [
    { key: "levels", done: known(f.profile) ? !f.profile.domains.some((d) => d.status === "assumed") : null, href: `${base}/levels/baseline` },
    { key: "curriculum", done: approved ? approved.length > 0 : null, href: `${base}/curricula` },
    {
      key: "unit",
      // A Unit someone (or the child's work, L2) moved past "Chưa học" in a book in use.
      done: approved ? approved.some((c) => Object.values(c.progress?.statusOf ?? {}).some((s) => s === "in_progress" || s === "done")) : null,
      href: approved && approved.length > 0 ? `${base}/curricula/${approved[0]!.id}` : `${base}/curricula`,
    },
    { key: "assign", done: given === null && f.practiceGiven === null ? null : (given ?? 0) + (f.practiceGiven ?? 0) > 0, href: `${base}/assign` },
    // "Đã xong" of Bài tập = checked and given feedback (D-d): the first loop closed for the child.
    { key: "feedback", done: known(f.assigned) ? f.assigned.done > 0 : null, href: `${base}/finish` },
    { key: "session", done: known(f.sessions) ? f.sessions.length > 0 : null, href: `${base}/notes/new` },
  ];
}

/** The card is shown while something is still to do or unknown; all six done → gone for good (it reads the data again each visit). */
export const startCardVisible = (items: readonly StartItem[]): boolean => items.some((i) => i.done !== true);
