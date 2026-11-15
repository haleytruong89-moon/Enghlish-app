import Link from "next/link";
import { studentDeskCopy as c } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import type { StudentPracticeItem } from "@/lib/practice/types";
import { sortTasks, taskHref, taskKey } from "@/lib/student/today";
import type { Task } from "@/lib/student/types";
import { PracticeCard } from "./PracticeCard";
import { dueText, kindLabel, modeText, offLabelText, purposeChip, taskTitle } from "./taskText";

function TaskRow({ task, hasCard }: { task: Task; hasCard: boolean }) {
  const href = taskHref(task, hasCard);
  const due = dueText(task.dueOn);
  const off = offLabelText(task);
  const extra = [modeText(task), purposeChip(task)].filter(Boolean);
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
          {extra.length > 0 ? ` · ${extra.join(" · ")}` : ""}
        </span>
      </span>
      <span className="shrink-0 text-[13px] font-medium text-muted">{due.iso ? <time dateTime={due.iso}>{due.text}</time> : due.text}</span>
    </>
  );
  const cls = "flex min-h-14 items-center gap-3 rounded-xl border border-line bg-white px-4 py-2 text-left no-underline";
  // A link / PDF task that has its card on this page is not a link (the card is below); without a card it opens /done/[id].
  const linkHref = href && !(task.assignmentId && hasCard) ? href : null;
  return (
    <li data-testid="task-row" data-kind={task.kind} data-doable={task.doable ? "yes" : "no"} data-activity={task.activityId ?? task.assignmentId ?? ""} data-step={task.stepNo ?? ""}>
      {linkHref ? (
        <Link href={linkHref} className={`${cls} hover:border-accent`}>
          {body}
        </Link>
      ) : (
        <div className={`${cls} ${task.doable ? "" : "text-muted"}`}>{body}</div>
      )}
    </li>
  );
}

/**
 * "Việc cần làm": the tasks the child can do in the app, ordered by lib/student/today.ts (they are the ones counted). Steps with the tutor / on paper are
 * listed apart and not counted. A link / PDF task has its card (open, send photos) below; once sent, the card stays in "Vừa gửi" for the rest of the
 * day while the tutor has not looked at it, so "Sửa lại" is still there. App / topic / revision steps open /activities/[id].
 */
export function TaskList({ tasks, practice, now = new Date() }: { tasks: Task[]; practice: StudentPracticeItem[]; now?: Date }) {
  const sorted = sortTasks(tasks);
  const open = sorted.filter((t) => t.doable);
  const off = sorted.filter((t) => !t.doable);
  const cards = new Map(practice.map((p) => [p.assignmentId, p]));
  const openCards = open.filter((t) => t.assignmentId && cards.has(t.assignmentId));
  const today = todayVn(now);
  const sent = practice.filter((p) => p.submission && !p.reviewed && todayVn(new Date(p.submission.submittedAt)) === today);
  return (
    <section aria-labelledby="tasks-title" className="flex flex-col gap-3" data-testid="task-list">
      <h2 id="tasks-title" className="text-lg font-bold">{c.tasksTitle}</h2>
      {open.length === 0 ? (
        <p className="rounded-2xl border border-line bg-white p-4 text-muted" data-testid="no-tasks">{c.noTasks}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {open.map((t) => (
            <TaskRow key={taskKey(t)} task={t} hasCard={Boolean(t.assignmentId && cards.has(t.assignmentId))} />
          ))}
        </ul>
      )}
      {openCards.map((t) => (
        <PracticeCard key={t.assignmentId} item={cards.get(t.assignmentId!)!} />
      ))}
      {off.length > 0 ? (
        <>
          <h3 className="mt-2 text-[15px] font-bold" data-testid="off-app-title">{c.offAppTitle}</h3>
          <p className="-mt-2 text-[13px] text-muted">{c.offAppNote}</p>
          <ul className="flex flex-col gap-2" data-testid="off-app-list">
            {off.map((t) => (
              <TaskRow key={taskKey(t)} task={t} hasCard={false} />
            ))}
          </ul>
        </>
      ) : null}
      {sent.length > 0 ? (
        <>
          <h3 className="mt-2 text-[15px] font-bold" data-testid="sent-title">{c.sentTitle}</h3>
          <p className="-mt-2 text-[13px] text-muted">{c.sentNote}</p>
          {sent.map((p) => (
            <PracticeCard key={p.assignmentId} item={p} />
          ))}
        </>
      ) : null}
    </section>
  );
}
