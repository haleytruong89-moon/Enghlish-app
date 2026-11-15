import Link from "next/link";
import { studentDeskCopy as c } from "@/lib/copy/vi";
import type { StudentPracticeItem } from "@/lib/practice/types";
import { sortTasks, taskHref, taskKey } from "@/lib/student/today";
import type { Task } from "@/lib/student/types";
import { PracticeCard } from "./PracticeCard";
import { dueText, kindLabel, offLabelText, taskTitle } from "./taskText";

function TaskRow({ task }: { task: Task }) {
  const href = taskHref(task);
  const due = dueText(task.dueOn);
  const off = offLabelText(task);
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{taskTitle(task)}</span>
        <span className="text-[13px] text-muted">
          {kindLabel(task)}
          {task.timeMin ? ` · ${c.minutes(task.timeMin)}` : ""}
          {task.hasDraft && task.filled !== null && task.total !== null ? (
            <>
              {" · "}
              <span data-count="work">{c.filled(task.filled, task.total)}</span>
            </>
          ) : null}
          {off ? ` · ${off}` : ""}
        </span>
      </span>
      <span className="shrink-0 text-[13px] font-medium text-muted">{due.iso ? <time dateTime={due.iso}>{due.text}</time> : due.text}</span>
    </>
  );
  const cls = "flex min-h-14 items-center gap-3 rounded-xl border border-line bg-white px-4 py-2 text-left no-underline";
  return (
    <li data-testid="task-row" data-kind={task.kind} data-doable={task.doable ? "yes" : "no"} data-activity={task.activityId ?? task.assignmentId ?? ""} data-step={task.stepNo ?? ""}>
      {href && !task.assignmentId ? (
        <Link href={href} className={`${cls} hover:border-accent`}>
          {body}
        </Link>
      ) : (
        <div className={`${cls} ${task.doable ? "" : "text-muted"}`}>{body}</div>
      )}
    </li>
  );
}

/**
 * "Việc cần làm": one list ordered by the rules of lib/student/today.ts. App / topic / revision steps open /activities/[id]; a link / PDF
 * task is listed here and its card (open, send photos) sits below, as in the former "Bài luyện" page.
 */
export function TaskList({ tasks, practice }: { tasks: Task[]; practice: StudentPracticeItem[] }) {
  const sorted = sortTasks(tasks);
  const cards = new Map(practice.map((p) => [p.assignmentId, p]));
  const withCard = sorted.filter((t) => t.assignmentId && cards.has(t.assignmentId));
  return (
    <section aria-labelledby="tasks-title" className="flex flex-col gap-3" data-testid="task-list">
      <h2 id="tasks-title" className="text-lg font-bold">{c.tasksTitle}</h2>
      {sorted.length === 0 ? (
        <p className="rounded-2xl border border-line bg-white p-4 text-muted" data-testid="no-tasks">{c.noTasks}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((t) => (
            <TaskRow key={taskKey(t)} task={t} />
          ))}
        </ul>
      )}
      {withCard.map((t) => (
        <PracticeCard key={t.assignmentId} item={cards.get(t.assignmentId!)!} />
      ))}
    </section>
  );
}
