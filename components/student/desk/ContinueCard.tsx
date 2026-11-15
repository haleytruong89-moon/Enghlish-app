import Link from "next/link";
import { studentDeskCopy as c } from "@/lib/copy/vi";
import { taskHref, type Continue } from "@/lib/student/today";
import { kindLabel, taskTitle } from "./taskText";

/** "Làm tiếp" (a draft exists: progress bar of the questions ANSWERED so far) or "Việc tiếp theo". The dimmed "Hỏi gia sư · Sắp có" slot only in practice items. */
export function ContinueCard({ pick }: { pick: Continue }) {
  const { task, resume } = pick;
  const href = taskHref(task);
  const showBar = resume && task.filled !== null && task.total !== null && task.total > 0;
  return (
    <section aria-labelledby="continue-title" data-testid="continue-card" data-resume={resume ? "yes" : "no"} className="flex flex-col gap-3 rounded-2xl bg-accent p-5 text-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[#DCE8E3]" data-testid="continue-eyebrow">{resume ? c.resume : c.next}</span>
        <span className="rounded-full bg-white/15 px-3 py-1 text-[13px] font-semibold">{kindLabel(task)}</span>
      </div>
      <h2 id="continue-title" className="text-xl font-bold leading-snug">{taskTitle(task)}</h2>
      {showBar ? (
        <div className="flex items-center gap-3">
          <div
            role="progressbar"
            aria-label={c.progressBar}
            aria-valuemin={0}
            aria-valuemax={task.total ?? 0}
            aria-valuenow={task.filled ?? 0}
            className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/25"
          >
            <i className="block h-full rounded-full bg-white" style={{ width: `${Math.min(100, Math.round(((task.filled ?? 0) / (task.total ?? 1)) * 100))}%` }} />
          </div>
          <span className="shrink-0 text-sm font-semibold" data-count="work">{c.filled(task.filled ?? 0, task.total ?? 0)}</span>
        </div>
      ) : task.timeMin ? (
        <p className="text-sm text-[#DCE8E3]">{c.minutes(task.timeMin)}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {href ? (
          <Link href={href} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-white px-6 text-base font-bold text-accent no-underline">
            {task.assignmentId ? c.openWork : resume ? c.resume : c.start}
          </Link>
        ) : null}
        {task.practice ? (
          <span className="flex flex-col gap-0.5">
            <button
              type="button"
              disabled
              aria-disabled="true"
              aria-describedby="ask-tutor-note"
              data-testid="ask-tutor"
              className="inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-xl border border-white/40 px-4 text-sm font-semibold text-white/70"
            >
              {c.askTutor} · {c.askTutorSoon}
            </button>
            <span id="ask-tutor-note" className="max-w-xs text-xs text-[#DCE8E3]">{c.askTutorNote}</span>
          </span>
        ) : null}
      </div>
    </section>
  );
}
