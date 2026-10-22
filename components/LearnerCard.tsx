import Link from "next/link";
import { assignPage, fallbackLabels, home, inquiriesPage, learnerWithTrack, levelCopy, notesPage, purgePage, readingPage, revisionReviewCopy, sourceLabels, targetsPage, todayPage, tutorHonorific, weakPage } from "@/lib/copy/vi";
import { safeColor, type LearnerSummary } from "@/lib/home/visible";
import { todayVn } from "@/lib/inquiries/dates";
import { formatDateVi } from "@/lib/inquiries/format";
import { formatHm } from "@/lib/work/view";
import { isOverdue } from "@/lib/practice/overdue";
import { itemList } from "@/lib/tutorwork/frameScore";
import type { TodayData } from "@/lib/tutorwork/load";

const linkClass = "inline-flex min-h-11 items-center text-sm font-medium text-accent underline";

function Attention({ learnerId, today, role }: { learnerId: string; today: TodayData; role: "tutor" | "parent" }) {
  const label = (key: string) => today.tagLabels[key] ?? fallbackLabels.tag;
  const rows: { key: string; href: string; badge: string; badgeClass: string; rowClass: string; title: string; line: string }[] = [
    // The student sent a picture / file: the tutor (or parent) reads it and fills in the result and the tags.
    ...today.practice
      .filter((a) => a.submission !== null)
      .slice(0, 3)
      .map((a) => ({
        key: `sent-${a.id}`,
        href: `/learners/${learnerId}/results/new?assignment=${a.id}`,
        badge: todayPage.submittedBadge,
        badgeClass: "bg-accent text-white",
        rowClass: "bg-[#e5efe9]",
        title: a.title,
        line: `${todayPage.submittedLine(a.title, a.submission ? `${formatDateVi(todayVn(new Date(a.submission.createdAt)))} ${formatHm(a.submission.createdAt)}` : "")} · ${todayPage.submittedNote}`,
      })),
    ...today.repeats.map((t) => ({
      key: `repeat-${t.tagKey}`,
      href: `/learners/${learnerId}/weak`,
      badge: todayPage.repeatBadge(t.sources),
      badgeClass: "bg-[#7a4a00] text-white",
      rowClass: "bg-[#fbf0dc]",
      title: t.label,
      line: todayPage.repeatLine(t.lastSeen ? formatDateVi(t.lastSeen) : null),
    })),
    ...today.untagged.slice(0, 3).map((u) => ({
      key: `untagged-${u.resultId}`,
      href: `/learners/${learnerId}/results/new#pending`,
      // The parent's own entries are hers to tag; only the tutor's are "waiting for the tutor".
      badge: role === "parent" && !u.own ? todayPage.untaggedParentBadge : todayPage.untaggedBadge,
      badgeClass: "bg-[#2f5d9e] text-white",
      rowClass: "bg-paper",
      title: u.title,
      line:
        role === "parent" && !u.own
          ? todayPage.untaggedParentLine(u.title, formatDateVi(u.takenOn), itemList(u.items))
          : todayPage.untaggedTutorLine(u.title, formatDateVi(u.takenOn), itemList(u.items)),
    })),
    // A tag that is both a repeat and due for a re-check shows once, as the repeat.
    ...today.due.filter((t) => !today.repeats.some((r) => r.tagKey === t.tagKey)).map((t) => ({
      key: `due-${t.tagKey}`,
      href: `/learners/${learnerId}/notes/new`,
      badge: todayPage.recheckBadge,
      badgeClass: "bg-accent text-white",
      rowClass: "bg-paper",
      title: label(t.tagKey),
      line: todayPage.recheckLine(t.lastSeen ? formatDateVi(t.lastSeen) : null, today.weak.policyDays),
    })),
  ];
  return (
    <section className="mt-4 flex flex-col gap-2" aria-label={todayPage.attentionTitle} data-testid={`attention-${learnerId}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">{todayPage.attentionTitle}</h3>
        <Link href={`/learners/${learnerId}/weak`} className={linkClass}>
          {todayPage.seeAll}
        </Link>
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted">{todayPage.attentionEmpty}</p> : null}
      {rows.map((r) => (
        <Link key={r.key} href={r.href} className={`flex items-start gap-3 rounded-lg px-4 py-3 text-ink no-underline ${r.rowClass}`}>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.badgeClass}`}>{r.badge}</span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-semibold">{r.title}</span>
            <span className="text-sm text-muted">{r.line}</span>
          </span>
        </Link>
      ))}
    </section>
  );
}

/**
 * Staff view (parent/tutor): "An · Track A", the two main actions, what needs attention, the last session and the other pages.
 * `today` is null when its numbers could not be loaded: the card still works, only the attention part is left out.
 */
export function LearnerCard({
  learner,
  today,
  role,
  todayIso = todayVn(),
}: {
  learner: LearnerSummary;
  today: TodayData | null;
  role: "tutor" | "parent";
  /** Today in Vietnam (YYYY-MM-DD); only for the "Quá hạn" label. */
  todayIso?: string;
}) {
  const color = safeColor(learner.color);
  const note = today?.lastNote ?? null;
  return (
    <li className="rounded-xl border border-line bg-white px-5 py-4" style={{ borderLeft: `6px solid ${color}` }}>
      <div className="flex min-h-12 items-center justify-between gap-4">
        <span className="text-lg font-semibold" style={{ color }}>
          {learnerWithTrack(learner.alias, learner.trackId)}
        </span>
        <span className="text-sm text-muted">{learner.status === "active" ? home.learnerActive : home.learnerDraft}</span>
      </div>

      <div className="mt-2 grid gap-3 sm:grid-cols-3" role="group" aria-label={todayPage.actionsLabel}>
        <Link
          href={`/learners/${learner.id}/notes/new`}
          data-testid={`action-note-${learner.id}`}
          className="flex min-h-24 flex-col gap-1 rounded-xl bg-accent px-5 py-4 text-white no-underline"
        >
          <span className="text-lg font-semibold">{todayPage.noteAction}</span>
          <span className="text-sm text-[#d8e6e0]">{todayPage.noteHint}</span>
        </Link>
        <Link
          href={`/learners/${learner.id}/results/new`}
          data-testid={`action-result-${learner.id}`}
          className="flex min-h-24 flex-col gap-1 rounded-xl border border-line bg-white px-5 py-4 text-ink no-underline hover:border-accent"
        >
          <span className="text-lg font-semibold text-accent">{todayPage.resultAction}</span>
          <span className="text-sm text-muted">{todayPage.resultHint}</span>
        </Link>
        <Link
          href={`/learners/${learner.id}/assign`}
          data-testid={`action-assign-${learner.id}`}
          className="flex min-h-24 flex-col gap-1 rounded-xl border border-line bg-white px-5 py-4 text-ink no-underline hover:border-accent"
        >
          <span className="text-lg font-semibold text-accent">{todayPage.assignAction}</span>
          <span className="text-sm text-muted">{todayPage.assignHint}</span>
        </Link>
      </div>

      {today ? <Attention learnerId={learner.id} today={today} role={role} /> : null}

      {today ? (
        <section className="mt-4 flex flex-col gap-2" aria-label={todayPage.practiceTitle} data-testid={`practice-${learner.id}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-semibold">{todayPage.practiceTitle}</h3>
            <Link href={`/learners/${learner.id}/assign`} className={linkClass}>
              {todayPage.practiceManage}
            </Link>
          </div>
          {today.practice.length === 0 ? <p className="text-sm text-muted">{todayPage.practiceNone}</p> : null}
          <ul className="flex flex-col gap-1 text-sm">
            {today.practice.slice(0, 5).map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span>
                  <b className="font-semibold">{a.title}</b>{" "}
                  <span className="text-muted">{todayPage.practiceLine(assignPage.kindLabel(a.kind, a.sourceKey ? sourceLabels[a.sourceKey] : null), a.dueOn ? formatDateVi(a.dueOn) : null)}</span>
                </span>
                <span className="text-muted">
                  {a.submission ? todayPage.submittedBadge : todayPage.practiceNotDone}
                  {isOverdue(a, todayIso) ? (
                    <b className="ml-2 rounded-full bg-[#7a4a00] px-2 py-0.5 text-xs font-semibold text-white" data-testid={`overdue-${a.id}`}>
                      {todayPage.practiceOverdue}
                    </b>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {today ? (
        <section className="mt-4 flex flex-col gap-1 text-sm" data-testid={`last-session-${learner.id}`}>
          {note ? (
            <>
              <h3 className="text-base font-semibold">{todayPage.lastSessionTitle(formatDateVi(note.sessionDate))}</h3>
              <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1">
                {note.studied ? (
                  <>
                    <dt className="text-muted">{todayPage.studied}</dt>
                    <dd>{note.studied}</dd>
                  </>
                ) : null}
                {note.weakTagKeys.length > 0 ? (
                  <>
                    <dt className="text-muted">{todayPage.reinforce}</dt>
                    <dd>{note.weakTagKeys.map((k) => today.tagLabels[k] ?? fallbackLabels.tag).join("; ")}</dd>
                  </>
                ) : null}
                {note.message ? (
                  <>
                    <dt className="text-muted">{todayPage.message}</dt>
                    <dd>“{note.message}”</dd>
                  </>
                ) : null}
                <dt className="text-muted">{todayPage.writtenBy}</dt>
                <dd>{todayPage.roleLabel[note.authorRole] ?? tutorHonorific}</dd>
              </dl>
            </>
          ) : (
            <p className="text-muted">{todayPage.lastSessionNone}</p>
          )}
          {today.recent ? <p className="text-muted">{todayPage.lastResultLine(today.recent.title, formatDateVi(today.recent.takenOn))}</p> : null}
        </section>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-x-4">
        <Link href={`/learners/${learner.id}/weak`} className={linkClass}>
          {weakPage.link}
        </Link>
        <Link href={`/learners/${learner.id}/levels`} data-testid={`levels-link-${learner.id}`} className={linkClass}>
          {levelCopy.link}
        </Link>
        <Link href={`/learners/${learner.id}/revisions`} data-testid={`revisions-link-${learner.id}`} className={linkClass}>
          {revisionReviewCopy.link}
        </Link>
        <Link href={`/learners/${learner.id}/reading/new`} className={linkClass}>
          {readingPage.link}
        </Link>
        <Link href={`/learners/${learner.id}/targets`} className={linkClass}>
          {targetsPage.link}
        </Link>
        <Link href={`/learners/${learner.id}/inquiries`} className={linkClass}>
          {inquiriesPage.link}
        </Link>
        <Link href={`/learners/${learner.id}/notes`} className={linkClass}>
          {notesPage.link}
        </Link>
        {role === "parent" ? (
          <Link href={`/learners/${learner.id}/delete`} data-testid={`delete-link-${learner.id}`} className={linkClass}>
            {purgePage.link}
          </Link>
        ) : null}
      </div>
    </li>
  );
}
