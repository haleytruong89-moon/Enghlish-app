import Link from "next/link";
import { deskCopy, fallbackLabels, todayPage, tutorHonorific } from "@/lib/copy/vi";
import { formatDateVi } from "@/lib/inquiries/format";
import { isOverdue } from "@/lib/practice/overdue";
import { stats } from "@/lib/sessions/count";
import type { SessionDay } from "@/lib/sessions/types";
import { lastText } from "@/lib/sessions/view";
import type { TodayData } from "@/lib/tutorwork/load";
import { BOX, BOX_LINK } from "./ProfileBox";

/** "Tháng 11: 5 buổi · buổi gần nhất 12/11" (one line; nothing when there is no session or the notes could not be read). */
function monthLine(days: SessionDay[] | null, todayIso: string): string | null {
  if (!days || days.length === 0) return null;
  const s = stats(days, todayIso);
  const month = Number(todayIso.slice(5, 7));
  return s.thisMonth > 0 ? deskCopy.monthLine(month, s.thisMonth, lastText(s.last)) : deskCopy.monthLineNone(month, lastText(s.last));
}

export function SessionsBox({ learnerId, today, todayIso, sessions = null }: { learnerId: string; today: TodayData | null; todayIso: string; sessions?: SessionDay[] | null }) {
  const note = today?.lastNote ?? null;
  const line = monthLine(sessions, todayIso);
  return (
    <section data-testid="desk-sessions" className={BOX}>
      <h2 className="text-lg font-semibold">{deskCopy.sessionsTitle}</h2>
      {line ? (
        <Link href={`/learners/${learnerId}/notes`} data-testid="desk-month-line" className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline">
          {line}
        </Link>
      ) : null}
      {today === null ? (
        <p className="text-sm text-muted">{deskCopy.sessionsUnavailable}</p>
      ) : (
        <>
          <div className="flex flex-col gap-1 text-sm" data-testid={`last-session-${learnerId}`}>
            {note ? (
              <>
                <h3 className="font-semibold">{todayPage.lastSessionTitle(formatDateVi(note.sessionDate))}</h3>
                <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1">
                  {note.studied ? (<><dt className="text-muted">{todayPage.studied}</dt><dd>{note.studied}</dd></>) : null}
                  {note.weakTagKeys.length > 0 ? (<><dt className="text-muted">{todayPage.reinforce}</dt><dd>{note.weakTagKeys.map((k) => today.tagLabels[k] ?? fallbackLabels.tag).join("; ")}</dd></>) : null}
                  {note.message ? (<><dt className="text-muted">{todayPage.message}</dt><dd>“{note.message}”</dd></>) : null}
                  <dt className="text-muted">{todayPage.writtenBy}</dt><dd>{todayPage.roleLabel[note.authorRole] ?? tutorHonorific}</dd>
                </dl>
              </>
            ) : (
              <p className="text-muted">{todayPage.lastSessionNone}</p>
            )}
            {today.recent ? <p className="text-muted">{todayPage.lastResultLine(today.recent.title, formatDateVi(today.recent.takenOn))}</p> : null}
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-[#eceee8] pt-2">
            <p className="text-sm" data-testid="desk-practice-counts">
              {deskCopy.practiceCounts(today.practice.length, today.practice.filter((a) => a.submission !== null).length, today.practice.filter((a) => isOverdue(a, todayIso)).length)}
            </p>
            <Link href={`/learners/${learnerId}/assign`} className={BOX_LINK}>{deskCopy.seeAssignments}</Link>
          </div>
        </>
      )}
      <p className="text-xs text-muted">{deskCopy.noSchedule}</p>
    </section>
  );
}
