import { studentDeskCopy as c } from "@/lib/copy/vi";
import type { ReviewPoints, StudentPracticeItem } from "@/lib/practice/types";
import { pickContinue, summarize } from "@/lib/student/today";
import type { Task } from "@/lib/student/types";
import { todayVn } from "@/lib/inquiries/dates";
import { todayLine } from "@/lib/work/view";
import { ContinueCard } from "./ContinueCard";
import { RefreshOnFocus } from "./RefreshOnFocus";
import { TaskList } from "./TaskList";

/** Hôm nay: greeting, "còn n việc · khoảng m phút", the Làm tiếp card, the task list, and the tutor's message. Numbers: the child's own work only. */
export function TodayView({
  alias,
  color,
  tasks,
  practice,
  review,
}: {
  alias: string;
  color: string;
  tasks: Task[];
  practice: StudentPracticeItem[];
  review: ReviewPoints | null;
}) {
  const sum = summarize(tasks);
  const pick = pickContinue(tasks);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5" data-testid="today-view">
      <RefreshOnFocus />
      <header className="flex flex-col gap-1">
        <time dateTime={todayVn()} className="text-[13px] text-muted">{todayLine()}</time>
        <h1 className="text-3xl font-bold" style={{ color }}>{c.greeting(alias)}</h1>
        <p className="text-lg" data-testid="today-lead">
          {sum.count > 0 ? (
            <>
              {c.leadStart}
              <strong data-count="work">{c.leadCount(sum.count)}</strong>
              {sum.minutes ? c.leadMinutes(sum.minutes) : ""}
            </>
          ) : (
            c.allDone
          )}
        </p>
      </header>
      {pick ? <ContinueCard pick={pick} hasCard={Boolean(pick.task.assignmentId && practice.some((p) => p.assignmentId === pick.task.assignmentId))} /> : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <TaskList tasks={tasks} practice={practice} />
        {review?.message ? (
          <aside aria-label={c.noteTitle} className="h-fit rounded-2xl border border-line bg-white p-4" data-testid="tutor-note">
            <h2 className="text-[15px] font-bold">{c.noteTitle}</h2>
            <p className="mt-2">“{review.message}”</p>
          </aside>
        ) : null}
      </div>
      <p className="text-sm text-muted">{c.footnote}</p>
    </div>
  );
}
