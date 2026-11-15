import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StudentDeskShell } from "@/components/student/desk/StudentDeskShell";
import { GoalPicker } from "@/components/student/goal/GoalPicker";
import { journeyCopy, weeklyGoalCopy as c } from "@/lib/copy/vi";
import { loadDeskBase } from "@/lib/student/desk";
import { goalOptions } from "@/lib/student/goal";
import { loadMyWeekView } from "@/lib/student/weekLoad";

export const dynamic = "force-dynamic";

/** "Đặt mục tiêu tuần" (W4d): the child picks a number of pieces per week inside the track's range; the tutor agrees; it starts next Monday. Staff get a plain 404. */
export default async function GoalPage() {
  const [base, week] = await Promise.all([loadDeskBase(), loadMyWeekView()]);
  if (base.kind === "login") redirect("/login");
  if (base.kind !== "ok") notFound();
  const shell = (children: React.ReactNode) => (
    <StudentDeskShell active="journey" learnerId={base.learnerId} seenTimes={(base.seenFirst ?? []).map((r) => r.newsAt)} showTestBadge={base.isTest}>
      {children}
    </StudentDeskShell>
  );
  if (!week) {
    return shell(
      <div className="mx-auto max-w-xl py-8">
        <h1 className="text-3xl font-bold">{c.pageTitle}</h1>
        <p className="mt-4 text-lg" data-testid="goal-unavailable">{c.unavailable}</p>
      </div>,
    );
  }
  const v = week.view;
  const options = goalOptions(v.range);
  const initial = v.pending?.pieces ?? v.upcoming?.pieces ?? v.goal ?? options[Math.floor((options.length - 1) / 2)] ?? v.range.min;
  return shell(
    <div className="mx-auto flex max-w-3xl flex-col gap-4" data-testid="goal-page">
      <Link href="/journey" className="inline-flex min-h-11 items-center text-[15px] font-semibold text-accent no-underline">{c.back}</Link>
      <div>
        <h1 className="text-3xl font-bold">{c.pageTitle}</h1>
        <p className="mt-1 text-muted">
          {c.lead} {v.goal !== null ? <span data-count="work">{c.leadCurrent(v.goal)}</span> : null}
        </p>
      </div>
      <GoalPicker
        options={options}
        current={v.goal}
        initial={Math.min(Math.max(initial, v.range.min), v.range.max)}
        pending={v.pending}
        upcomingPieces={v.upcoming ? v.upcoming.pieces : null}
        upcomingKind={v.upcoming?.kind}
        suggestion={v.suggestion ? c.suggestRange(v.suggestion.low, v.suggestion.high) : null}
      />
      <p className="text-sm text-muted">{journeyCopy.footnote}</p>
    </div>,
  );
}
