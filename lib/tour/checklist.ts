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
  /** Link / PDF work given, all of it (`today.assignments`); null = unknown. Studio work is in `assigned`. */
  linkGiven: number | null;
  sessions: SessionDay[] | null;
};

const known = <T,>(v: T | null | undefined): v is T => v !== null && v !== undefined;

export function startChecklist(learnerId: string, facts: StartFacts): StartItem[] {
  let f = facts;
  const base = `/learners/${learnerId}`;
  if (known(f.profile) && f.profile.domains.length === 0) f = { ...f, profile: null }; // no domains = nothing to confirm yet: unknown
  const approved = known(f.curricula) ? f.curricula.filter((c) => c.current !== null) : null;
  // Work still given (a retracted one does not count). `assigned` already holds link / PDF work when it could be read.
  const given = known(f.assigned) ? f.assigned.need + f.assigned.doing + f.assigned.done : null;
  const assignDone = given !== null ? given > 0 : f.linkGiven !== null && f.linkGiven > 0 ? true : null;
  return [
    { key: "levels", done: known(f.profile) ? !f.profile.domains.some((d) => d.status === "assumed") : null, href: `${base}/levels/baseline` },
    { key: "curriculum", done: approved ? approved.length > 0 : null, href: `${base}/curricula` },
    {
      key: "unit",
      // A Unit a person moved past "Chưa học" in a book in use (a status the app set from the child's work, L2, does not count).
      done: approved
        ? approved.some((c) => Object.entries(c.progress?.statusOf ?? {}).some(([code, s]) => (s === "in_progress" || s === "done") && !c.progress?.autoOf?.[code]))
        : null,
      href: approved && approved.length > 0 ? `${base}/curricula/${approved[0]!.id}` : `${base}/curricula`,
    },
    { key: "assign", done: assignDone, href: `${base}/assign` },
    // "Đã xong" of Bài tập: work fully checked (and, for a child's submission, given feedback, D-d). Named "Chấm xong", not "góp ý":
    // a quick result typed by an adult for link work also lands there.
    { key: "feedback", done: known(f.assigned) ? f.assigned.done > 0 : null, href: `${base}/finish` },
    // A session = a day with a current note written by the tutor (DOMAIN §5.6); a parent-only day is shown, never counted.
    { key: "session", done: known(f.sessions) ? f.sessions.some((d) => d.sessions > 0) : null, href: `${base}/notes/new` },
  ];
}

/** The card is shown while something is still to do or unknown; all six done → gone for good (it reads the data again each visit). */
export const startCardVisible = (items: readonly StartItem[]): boolean => items.some((i) => i.done !== true);
