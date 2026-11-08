/**
 * "Cần chú ý" of the desk (spec §5 rule 3: the full list lives only here). Pure. The rows of the old learner card (sent work, repeats,
 * waiting for a tag, due for a re-check) keep their wording; new rows: no intake profile, no curriculum, overdue practice, ⚑ flags.
 */
import { deskCopy, fallbackLabels, todayPage } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import { formatDateVi } from "@/lib/inquiries/format";
import { isOverdue } from "@/lib/practice/overdue";
import { itemList } from "@/lib/tutorwork/frameScore";
import type { TodayData } from "@/lib/tutorwork/load";
import { formatHm } from "@/lib/work/view";

export type AlertTone = "warn" | "info" | "sent" | "repeat" | "tag" | "recheck";
export type DeskAlert = { key: string; tone: AlertTone; badge: string; title: string; line: string; href: string };
export type DeskAlertInput = {
  learnerId: string;
  role: "tutor" | "parent";
  todayIso: string;
  today: TodayData | null;
  /** null = unknown (W1 tables not readable): no alert. */
  intakeMissing: boolean | null;
  /** null = unknown: no alert. */
  curriculaCount: number | null;
  flagCount: number;
};

export function deskAlerts(i: DeskAlertInput): DeskAlert[] {
  const base = `/learners/${i.learnerId}`;
  const out: DeskAlert[] = [];
  const A = deskCopy.alerts;
  if (i.intakeMissing === true) out.push({ key: "intake", tone: "warn", badge: A.missingBadge, title: A.intakeTitle, line: i.role === "tutor" ? A.intakeLineTutor : A.intakeLineParent, href: `${base}/levels#intake` });
  if (i.curriculaCount === 0) out.push({ key: "curricula", tone: "info", badge: A.missingBadge, title: A.curriculaTitle, line: A.curriculaLine, href: `${base}/curricula` });
  const t = i.today;
  if (t) {
    const late = t.practice.filter((a) => isOverdue(a, i.todayIso)).length;
    if (late > 0) out.push({ key: "overdue", tone: "warn", badge: todayPage.practiceOverdue, title: A.overdueTitle(late), line: A.overdueLine, href: `${base}/assign` });
    const label = (key: string) => t.tagLabels[key] ?? fallbackLabels.tag;
    for (const a of t.practice.filter((x) => x.submission !== null).slice(0, 3)) {
      const when = a.submission ? `${formatDateVi(todayVn(new Date(a.submission.createdAt)))} ${formatHm(a.submission.createdAt)}` : "";
      out.push({ key: `sent-${a.id}`, tone: "sent", badge: todayPage.submittedBadge, title: a.title, line: `${todayPage.submittedLine(a.title, when)} · ${todayPage.submittedNote}`, href: `${base}/results/new?assignment=${a.id}` });
    }
    for (const r of t.repeats) out.push({ key: `repeat-${r.tagKey}`, tone: "repeat", badge: todayPage.repeatBadge(r.sources), title: r.label, line: todayPage.repeatLine(r.lastSeen ? formatDateVi(r.lastSeen) : null), href: `${base}/weak` });
    for (const u of t.untagged.slice(0, 3)) {
      // The parent's own entries are hers to tag; only the tutor's are "waiting for the tutor".
      const waiting = i.role === "parent" && !u.own;
      out.push({
        key: `untagged-${u.resultId}`, tone: "tag", badge: waiting ? todayPage.untaggedParentBadge : todayPage.untaggedBadge, title: u.title,
        line: waiting ? todayPage.untaggedParentLine(u.title, formatDateVi(u.takenOn), itemList(u.items)) : todayPage.untaggedTutorLine(u.title, formatDateVi(u.takenOn), itemList(u.items)),
        href: `${base}/results/new#pending`,
      });
    }
    // A tag that is both a repeat and due for a re-check shows once, as the repeat.
    for (const d of t.due.filter((x) => !t.repeats.some((r) => r.tagKey === x.tagKey))) {
      out.push({ key: `due-${d.tagKey}`, tone: "recheck", badge: todayPage.recheckBadge, title: label(d.tagKey), line: todayPage.recheckLine(d.lastSeen ? formatDateVi(d.lastSeen) : null, t.weak.policyDays), href: `${base}/notes/new` });
    }
  }
  if (i.flagCount > 0) out.push({ key: "flags", tone: "info", badge: A.flagBadge, title: A.flagsTitle(i.flagCount), line: A.flagsLine, href: `${base}/inbox?f=skills` });
  return out;
}
