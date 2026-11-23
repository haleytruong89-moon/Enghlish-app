import Link from "next/link";
import { tutorInWorkEnabled } from "@/lib/tutor/config";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { RevisionForm } from "@/components/revision/RevisionForm";
import { ActivityNote } from "@/components/student/ActivityNote";
import { SourceReader } from "@/components/student/SourceReader";
import { TaskLines } from "@/components/student/TaskLines";
import { TaskParts } from "@/components/student/TaskParts";
import { Player } from "@/components/student/player/Player";
import { StudentDeskShell } from "@/components/student/desk/StudentDeskShell";
import { WorkForm } from "@/components/student/WorkForm";
import { concepts, messages, modeLabels, revisionCopy, work } from "@/lib/copy/vi";
import { loadDeskBase } from "@/lib/student/desk";
import { loadActivityPage, loadIsTest, loadResultView, loadRevisionPage, loadTaskParts } from "@/lib/work/load";
import { formatDmy, formatHm, stepTitle } from "@/lib/work/view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Learning OS" };

/** One released step for the signed-in student: sources, questions or writing, help declaration, submit. */
export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadActivityPage(id);
  if (data.kind === "login") redirect("/login");
  if (data.kind === "not-found") notFound();
  const a = data.activity;
  if (!a.supported && a.mode === "REVISION") {
    // S6: a REVISION step with feedback is done in the app (eng_revision_open); without feedback it stays a neutral "not in the app" step.
    const r = await loadRevisionPage(id);
    if (r.kind === "login") redirect("/login");
    if (r.kind === "ok") {
      const rv = r.revision;
      return (
        <>
          <AppHeader />
          <main className="mx-auto flex max-w-xl flex-col gap-3.5 px-5 py-5" data-testid="revision-page">
            <header className="flex items-center gap-2">
              <Link href="/" className="flex min-h-11 min-w-11 items-center text-sm font-semibold text-accent">
                {work.back(rv.titleVi)}
              </Link>
            </header>
            <h1 className="text-lg font-bold">{revisionCopy.pageTitle}</h1>
            {rv.state === "todo" ? (
              <RevisionForm revision={rv} />
            ) : (
              <section className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4" data-testid={`revision-${rv.state}`}>
                <p role="status" className="text-[15px] font-semibold text-accent">
                  {rv.state === "seen" ? revisionCopy.seenTitle : revisionCopy.waiting}
                </p>
                {rv.state === "seen" && rv.closingNote ? (
                  <p className="text-[15px]">
                    {revisionCopy.closingLabel}: {rv.closingNote}
                  </p>
                ) : null}
                <Link href="/" className="flex min-h-12 items-center self-start rounded-xl bg-accent px-5 text-base font-bold text-white">
                  {work.homeLink}
                </Link>
              </section>
            )}
          </main>
        </>
      );
    }
  }
  if (!a.supported) {
    // Nothing of the step except its neutral label: no prompt, questions, sources or self-check.
    return (
      <>
        <AppHeader />
        <main className="mx-auto flex max-w-xl flex-col gap-3.5 px-5 py-5">
          <header className="flex items-center gap-2">
            <Link href="/" className="flex min-h-11 min-w-11 items-center text-sm font-semibold text-accent">
              {work.back(a.titleVi)}
            </Link>
          </header>
          <h1 className="text-lg font-bold">{stepTitle(a.activityType)}</h1>
          <p className="rounded-2xl border border-line bg-white p-4 text-[15px]" data-testid="not-in-app">
            {work.statusLabels[a.statusLabelKey]}
          </p>
        </main>
      </>
    );
  }
  const last = a.attempts[a.attempts.length - 1];
  // P12: reading text beside the questions on wide screens.
  const sideBySide = a.shape === "answers" && a.sources.some((s) => s.modality === "text" && !!s.text);
  const chip = a.purpose.includes("delayed_check")
    ? concepts.delayedCheck.student
    : a.purpose.includes("transfer_check")
      ? concepts.transferCheck.student
      : null;

  // W4c2: questions are done one at a time in the Player; writing steps keep the plain form below.
  if (a.shape === "answers" && a.step.items.length > 0) {
    const [base, isTest, result, parts] = await Promise.all([loadDeskBase(), loadIsTest(id, a.mode), a.attempts.length > 0 ? loadResultView(id) : Promise.resolve(null), loadTaskParts(id)]);
    if (base.kind === "login") redirect("/login");
    if (base.kind === "ok") {
      const aside = (
        <div className="flex flex-col gap-3.5">
          <ActivityNote note={data.note} />
          <section aria-labelledby="task" className="flex flex-col gap-1.5 rounded-2xl border border-line bg-white p-4">
            <h2 id="task" className="text-sm font-semibold text-muted">
              {work.taskTitle}
            </h2>
            {parts ? <TaskParts parts={parts} /> : <TaskLines prompt={a.step.promptEn} className="text-[16px] font-semibold leading-snug" />}
            <p className="text-sm text-muted">
              <span lang="en">{a.bigQuestionEn}</span>
              {a.step.timeMin ? ` · ${work.minutes(a.step.timeMin)}` : ""}
              {chip ? ` · ${chip}` : ""}
            </p>
          </section>
          <SourceReader sources={a.sources} />
        </div>
      );
      return (
        <StudentDeskShell active="today" learnerId={base.learnerId} seenTimes={(base.seenFirst ?? []).map((r) => r.newsAt)} showTestBadge={base.isTest}>
          {result || a.canSubmit ? (
            <Player key={id} activity={a} isTest={isTest} initialResult={result} sentAt={!result && last ? last.submittedAt : null} aside={aside} parts={parts} tutorInWork={tutorInWorkEnabled()} />
          ) : (
            <section data-testid="already-submitted" className="mx-auto flex max-w-2xl flex-col gap-2 rounded-2xl border border-line bg-white p-4">
              <p role="status" className="text-[15px] font-semibold text-accent">
                {last ? (last.provenance === "offline" ? work.doneOffline : work.alreadySubmitted(formatHm(last.submittedAt), formatDmy(last.submittedAt))) : ""}
              </p>
              <Link href="/" className="flex min-h-12 items-center self-start rounded-xl bg-accent px-5 text-base font-bold text-white">
                {work.homeLink}
              </Link>
            </section>
          )}
        </StudentDeskShell>
      );
    }
  }
  return (
    <>
      <AppHeader />
      <main className={`mx-auto flex flex-col gap-3.5 px-5 py-5 ${sideBySide ? "max-w-xl lg:max-w-6xl" : "max-w-xl"}`}>
        <header className="flex items-center gap-2">
          <Link href="/" className="flex min-h-11 min-w-11 items-center text-sm font-semibold text-accent">
            {work.back(a.titleVi)}
          </Link>
        </header>
        <h1 className="text-lg font-bold">{stepTitle(a.activityType)}</h1>

        <div role="status" data-testid="mode-banner" className="rounded-xl bg-[#E3ECE8] px-3.5 py-3 text-sm leading-snug text-[#1F4439]">
          <b>{modeLabels[a.mode].student}.</b>
          {a.mode === "INDEPENDENT_CHECK" ? <> {messages.independentCheck}</> : null}
          {chip ? <span className="block text-[13px]">{chip}</span> : null}
        </div>

        <ActivityNote note={data.note} />

        <section aria-labelledby="task" className="flex flex-col gap-1.5 rounded-2xl border border-line bg-white p-4">
          <h2 id="task" className="text-sm font-semibold text-muted">
            {work.taskTitle}
          </h2>
          <TaskLines prompt={a.step.promptEn} className="text-[17px] font-semibold leading-snug" />
          <p className="text-sm text-muted">
            <span lang="en">{a.bigQuestionEn}</span>
            {a.step.timeMin ? ` · ${work.minutes(a.step.timeMin)}` : ""}
          </p>
        </section>

        <div className={sideBySide ? "flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6" : "flex flex-col gap-3.5"}>
          <div className={sideBySide ? "lg:sticky lg:top-4" : undefined}>
            <SourceReader sources={a.sources} />
          </div>
          <div className="flex flex-col gap-3.5">
            {a.canSubmit ? (
              <WorkForm activity={a} />
            ) : (
              <section data-testid="already-submitted" className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4">
                <p role="status" className="text-[15px] font-semibold text-accent">
                  {last ? (last.provenance === "offline" ? work.doneOffline : work.alreadySubmitted(formatHm(last.submittedAt), formatDmy(last.submittedAt))) : ""}
                </p>
                <p className="text-sm text-muted">{work.checkOnce}</p>
                <Link href="/" className="flex min-h-12 items-center self-start rounded-xl bg-accent px-5 text-base font-bold text-white">
                  {work.homeLink}
                </Link>
              </section>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
