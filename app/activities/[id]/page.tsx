import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { RevisionForm } from "@/components/revision/RevisionForm";
import { ActivityNote } from "@/components/student/FeedbackBox";
import { SourceReader } from "@/components/student/SourceReader";
import { StudioReview } from "@/components/student/StudioReview";
import { WorkForm } from "@/components/student/WorkForm";
import { concepts, messages, modeLabels, revisionCopy, work } from "@/lib/copy/vi";
import { loadActivityPage, loadRevisionPage, loadStudioReview } from "@/lib/work/load";
import { formatHm, stepTitle } from "@/lib/work/view";

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
  // Studio B1: "Câu cần xem lại" (board 20) once something is submitted; null for weekly topics.
  const studio = a.attempts.length > 0 ? await loadStudioReview(id) : null;
  // P12: reading text beside the questions on wide screens.
  const sideBySide = a.shape === "answers" && a.sources.some((s) => s.modality === "text" && !!s.text);
  const chip = a.purpose.includes("delayed_check")
    ? concepts.delayedCheck.student
    : a.purpose.includes("transfer_check")
      ? concepts.transferCheck.student
      : null;

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
          <p lang="en" className="text-[17px] font-semibold leading-snug">
            {a.step.promptEn}
          </p>
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
            {studio ? (
              <StudioReview review={studio}>{a.canSubmit ? <WorkForm activity={a} /> : null}</StudioReview>
            ) : a.canSubmit ? (
              <WorkForm activity={a} />
            ) : (
              <section data-testid="already-submitted" className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4">
                <p role="status" className="text-[15px] font-semibold text-accent">
                  {last ? (last.provenance === "offline" ? work.doneOffline : work.alreadySubmitted(formatHm(last.submittedAt))) : ""}
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
