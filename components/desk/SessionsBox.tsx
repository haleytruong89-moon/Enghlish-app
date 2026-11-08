import Link from "next/link";
import { deskCopy, fallbackLabels, todayPage, tutorHonorific } from "@/lib/copy/vi";
import { formatDateVi } from "@/lib/inquiries/format";
import { isOverdue } from "@/lib/practice/overdue";
import type { TodayData } from "@/lib/tutorwork/load";
import { BOX, BOX_LINK } from "./ProfileBox";

export function SessionsBox({ learnerId, today, todayIso }: { learnerId: string; today: TodayData | null; todayIso: string }) {
  const note = today?.lastNote ?? null;
  return (
    <section data-testid="desk-sessions" className={BOX}>
      <h2 className="text-lg font-semibold">{deskCopy.sessionsTitle}</h2>
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
