import Link from "next/link";
import { concepts, home, modeLabels, work } from "@/lib/copy/vi";
import { pickNextTask, stepState, type StepState } from "@/lib/work/nextTask";
import type { HomeInquiry, HomeStep, HomeView } from "@/lib/work/types";
import { doableInApp, stepTitle, todayLine, unsupportedLabel } from "@/lib/work/view";

/** Done = filled green circle with a tick; now = ringed dot; later = empty grey ring (as in the Main mockup). */
function StateIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" className="shrink-0">
        <circle cx="12" cy="12" r="11" fill="#2B5D4F" />
        <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === "now") {
    return (
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" className="shrink-0">
        <circle cx="12" cy="12" r="10" fill="none" stroke="#2B5D4F" strokeWidth="2" />
        <circle cx="12" cy="12" r="4" fill="#2B5D4F" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" className="shrink-0">
      <circle cx="12" cy="12" r="10" fill="none" stroke="#B8BDB3" strokeWidth="2" />
    </svg>
  );
}

const STATE_TEXT: Record<StepState, string> = { done: work.stateDone, now: work.stateNow, later: work.stateLater };

function StepRow({ step, state }: { step: HomeStep; state: StepState }) {
  const doable = doableInApp(step.activityType, step.mode);
  const title = stepTitle(step.activityType);
  const chip = step.purpose.includes("delayed_check")
    ? concepts.delayedCheck.student
    : step.purpose.includes("transfer_check")
      ? concepts.transferCheck.student
      : null;
  const body = (
    <>
      <StateIcon state={state} />
      <span className="flex min-w-0 flex-col">
        <span className={state === "now" ? "font-bold" : state === "later" ? "text-muted" : ""}>{title}</span>
        {!doable ? <span className="text-[13px] text-muted">{unsupportedLabel(step.activityType)}</span> : null}
        {chip ? <span className="text-[13px] text-[#6B4600]">{chip}</span> : null}
      </span>
      <span className="ml-auto shrink-0 pl-2 text-[13px] font-semibold text-accent">{doable ? STATE_TEXT[state] : state === "done" ? STATE_TEXT.done : ""}</span>
    </>
  );
  const common = "flex min-h-11 items-center gap-2.5 rounded-lg text-sm";
  return (
    <li data-testid={`step-${step.stepNo}`} data-state={state}>
      {doable ? (
        <Link href={`/activities/${step.activityId}`} className={`${common} -mx-1 px-1 hover:bg-paper`}>
          {body}
        </Link>
      ) : (
        <div className={common}>{body}</div>
      )}
    </li>
  );
}

function InquiryCard({ inquiry, next }: { inquiry: HomeInquiry; next: ReturnType<typeof pickNextTask> }) {
  const done = inquiry.steps.filter((s) => s.attempts > 0).length;
  return (
    <section
      aria-labelledby={`inq-${inquiry.instanceId}`}
      data-testid="inquiry-card"
      className="flex flex-col gap-2.5 rounded-2xl border border-line bg-white p-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={`inq-${inquiry.instanceId}`} className="text-[15px] font-bold">
          {work.topicTitle(inquiry.titleVi)}
        </h2>
        <span className="shrink-0 text-[13px] text-muted">{work.progress(done, inquiry.steps.length)}</span>
      </div>
      <ol className="flex flex-col gap-1">
        {inquiry.steps.map((s) => (
          <StepRow key={s.activityId} step={s} state={stepState(s, next)} />
        ))}
      </ol>
    </section>
  );
}

/**
 * The student's home: greeting, "Việc tiếp theo", this week's released steps. Only what the API allows
 * (no keys, no results, no scores). Mobile first, as the Main mockup.
 */
export function StudentHome({ alias, color, data }: { alias: string; color: string; data: HomeView }) {
  const next = pickNextTask(data);
  const hasSteps = data.inquiries.some((q) => q.steps.length > 0);
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-5 py-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] text-muted">{todayLine()}</span>
          <h1 className="text-2xl font-bold" style={{ color }}>
            {home.studentGreeting(alias)}
          </h1>
        </div>
        <div
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 bg-white text-lg font-bold"
          style={{ color, borderColor: color }}
        >
          {alias.slice(0, 1).toUpperCase()}
        </div>
      </header>

      {next ? (
        <section
          aria-labelledby="next"
          data-testid="next-task"
          className="flex flex-col gap-2 rounded-2xl bg-accent p-[18px] text-white"
        >
          <h2 id="next" className="text-sm font-semibold text-[#DCE8E3]">
            {work.nextTitle}
          </h2>
          <p className="text-xl font-bold leading-snug">{stepTitle(next.step.activityType)}</p>
          <span lang="en" className="text-sm text-[#DCE8E3]">
            {next.inquiry.bigQuestionEn}
          </span>
          <span className="text-sm leading-snug">
            {next.step.timeMin ? `${work.minutes(next.step.timeMin)}. ` : ""}
            {modeLabels[next.step.mode].student}
          </span>
          <Link
            href={`/activities/${next.step.activityId}`}
            className="mt-1.5 flex min-h-12 items-center justify-center rounded-xl bg-white text-base font-bold text-accent"
          >
            {work.start}
          </Link>
        </section>
      ) : (
        <p className="rounded-2xl border border-line bg-white p-4 text-[15px]" data-testid="no-next-task">
          {hasSteps ? work.allDone : home.studentEmpty}
        </p>
      )}

      {data.inquiries.map((q) => (
        <InquiryCard key={q.instanceId} inquiry={q} next={next} />
      ))}
    </main>
  );
}
