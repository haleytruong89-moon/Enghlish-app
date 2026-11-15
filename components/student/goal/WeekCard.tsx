import Link from "next/link";
import { streakCopy, weeklyGoalCopy as c } from "@/lib/copy/vi";
import { ddmm } from "@/lib/student/week";
import type { WeekView } from "@/lib/student/weekView";
import { Dots } from "./Dots";

const BTN = "inline-flex min-h-11 items-center rounded-xl border border-line bg-[#E3ECE8] px-4 text-sm font-semibold text-[#1F4439] no-underline";

/** "Mục tiêu tuần" card of Hành trình: this week, the goal waiting for the tutor / agreed for next week, and the soft streak. */
export function WeekCard({ view }: { view: WeekView }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5" aria-labelledby="week-card-title" data-testid="week-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="week-card-title" className="text-lg font-semibold">{c.title}</h2>
          <p className="text-sm text-muted">{c.weekOf} <time dateTime={view.week}>{view.rangeLabel}</time></p>
        </div>
        <Link href="/goal" className={BTN} data-testid="week-change-goal">{view.goal === null ? c.setGoal : c.changeGoal}</Link>
      </div>
      {view.goal === null ? (
        <>
          <p className="mt-3 text-[16px] font-semibold">{c.noGoalTitle}</p>
          <p className="text-sm text-muted">{c.noGoalBody}</p>
        </>
      ) : (
        <>
          <p className="mt-3 text-3xl font-bold leading-tight">
            <span data-count="work">{c.sent(view.count, view.goal)}</span> <small className="text-[17px] font-semibold text-muted">· {c.sentThisWeek}</small>
          </p>
          <div role="img" aria-label={c.dotsLabel(view.count, view.goal)}>
            <Dots done={view.count} goal={view.goal} />
          </div>
          {view.met ? (
            <p className="font-semibold text-accent" data-testid="week-met">{c.reached}</p>
          ) : (
            <p className="text-sm text-muted" data-testid="week-remaining">{c.remaining(view.remaining)}</p>
          )}
        </>
      )}
      <p className="mt-1 text-sm text-muted">{c.onlySent}</p>
      {view.pending ? (
        <p className="mt-3 inline-flex rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900" data-testid="week-pending">{c.pendingTag(view.pending.pieces)}</p>
      ) : view.upcoming ? (
        <p className="mt-3 inline-flex rounded-full bg-[#E3ECE8] px-3 py-1 text-sm font-semibold text-[#1F4439]" data-testid="week-upcoming">
          {c.upcomingTag(view.upcoming.pieces, view.upcoming.kind)} (<time dateTime={view.upcoming.from}>{ddmm(view.upcoming.from)}</time>)
        </p>
      ) : null}
      <p className="mt-4 font-semibold" data-testid="streak-line">
        {view.streak > 0 ? <span data-count="work">{streakCopy.line(view.streak)}</span> : streakCopy.none}
      </p>
      <p className="mt-1 text-sm text-muted">{streakCopy.explain}</p>
    </section>
  );
}
