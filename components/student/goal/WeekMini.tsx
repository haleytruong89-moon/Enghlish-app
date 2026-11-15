import Link from "next/link";
import { weeklyGoalCopy as c } from "@/lib/copy/vi";
import type { WeekView } from "@/lib/student/weekView";
import { Dots } from "./Dots";

const LINK = "inline-flex min-h-11 items-center gap-1 text-[15px] font-semibold text-accent underline";

/** The small "Mục tiêu tuần" card of Hôm nay: this week's pieces sent, or an invitation to set the goal. Counts of the child's own work only. */
export function WeekMini({ view }: { view: WeekView }) {
  if (view.goal === null) {
    return (
      <section className="h-fit rounded-2xl border border-line bg-white p-4" aria-labelledby="week-mini-title" data-testid="week-mini" data-state="no-goal">
        <h2 id="week-mini-title" className="text-[15px] font-bold">{c.title}</h2>
        {view.pending ? (
          <p className="mt-2 text-sm" data-testid="week-pending">{c.pendingTag(view.pending.pieces)}</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">{c.noGoalBody}</p>
            <Link href="/goal" className={`${LINK} mt-1`} data-testid="week-set-goal">{c.setGoal}</Link>
          </>
        )}
      </section>
    );
  }
  return (
    <section className="h-fit rounded-2xl border border-line bg-white p-4" aria-labelledby="week-mini-title" data-testid="week-mini" data-state={view.met ? "met" : "open"}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="week-mini-title" className="text-[15px] font-bold">{c.title}</h2>
        <time dateTime={view.week} className="text-sm text-muted">{view.rangeLabel}</time>
      </div>
      <div role="img" aria-label={c.dotsLabel(view.count, view.goal)}>
        <Dots done={view.count} goal={view.goal} />
      </div>
      <p className="text-[16px]">
        <strong data-count="work">{c.miniSent(view.count, view.goal)}</strong>
        {view.met ? <span className="font-semibold text-accent"> · {c.reachedShort}</span> : null}
      </p>
      <p className="mt-1 text-[13px] text-muted">{c.onlySent}</p>
      <Link href="/journey" className={`${LINK} mt-1`}>{c.seeJourney}</Link>
    </section>
  );
}
