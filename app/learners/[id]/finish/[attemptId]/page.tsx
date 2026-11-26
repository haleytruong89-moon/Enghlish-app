import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FinishWork } from "@/components/finish/FinishWork";
import { finishCopy as c, learnerWithTrack } from "@/lib/copy/vi";
import { loadFinish } from "@/lib/finish/load";
import { finishHref } from "@/lib/finish/paths";
import { queuePlace } from "@/lib/finish/queue";
import { tallyParts } from "@/lib/finish/view";
import { todayVn } from "@/lib/inquiries/dates";
import { formatDay } from "@/lib/review/format";
import { deskHref } from "@/lib/shell/paths";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const vnDay = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10);
const daysBetween = (fromIso: string, todayIso: string) => Math.max(0, Math.round((Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${vnDay(fromIso)}T00:00:00Z`)) / DAY));

/** L1 · "Xong một bài": one Studio submission, checked, looked over and given feedback on one screen. Tutor or parent of the child. */
export default async function FinishPage({ params }: { params: Promise<{ id: string; attemptId: string }> }) {
  const { id, attemptId } = await params;
  const { learner, member } = await requireLearnerPage(id, "work:review");
  const today = todayVn();
  const data = await loadFinish(learner.id, attemptId, member.id, today);
  if (data === null) notFound();
  if ("notStudio" in data) redirect(`/review/${data.notStudio}`);

  const place = queuePlace(data.queue, data.attemptId);
  const total = tallyParts(data.parts);
  const done = data.feedback !== null && total.pending === 0 && data.retryCount === 0;
  const next = place.next;
  const inApp = data.parts.reduce((n, p) => n + p.items.filter((i) => i.state !== "paper").length, 0);
  const chip = "rounded-full bg-[#E3ECE8] px-3 py-1 text-[#1F4439]";
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4" data-testid="finish-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          <Link href={deskHref(learner.id)} className="text-accent underline">{c.backDesk}</Link> · {c.crumb(learnerWithTrack(learner.alias, learner.trackId))}
        </p>
        <nav aria-label={c.title} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted" data-testid="finish-place">{place.index !== null ? c.place(place.index, place.total) : c.placeDone(place.total)}</span>
          {place.prev ? <Link href={finishHref(learner.id, place.prev.attemptId)} className="inline-flex min-h-11 items-center rounded-xl border border-line bg-white px-3 no-underline">{c.prev}</Link> : null}
          {place.index !== null && place.next ? <Link href={finishHref(learner.id, place.next.attemptId)} className="inline-flex min-h-11 items-center rounded-xl border border-line bg-white px-3 no-underline">{c.next}</Link> : null}
        </nav>
      </div>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{data.title}</h1>
        <ul className="flex flex-wrap gap-2 text-sm">
          <li className="rounded-full bg-[#fde7d9] px-3 py-1 font-semibold text-[#8a3410]">{c.sent(formatDay(data.submittedAt), daysBetween(data.submittedAt, today))}</li>
          <li className={chip}>{data.counted ? c.counted : c.notCounted}</li>
          <li className={chip}>{c.inApp(inApp)}</li>
        </ul>
      </header>
      <FinishWork
        key={`${data.attemptId}-${data.feedback?.id ?? "none"}-${total.pending}`}
        learnerId={learner.id}
        attemptId={data.attemptId}
        parts={data.parts}
        feedback={data.feedback}
        feedbackReady={data.feedbackReady}
        retrySeenThrough={data.retrySeenThrough}
        retryCount={data.retryCount}
        done={done}
        next={next ? { href: finishHref(learner.id, next.attemptId), title: next.title } : null}
        backHref={deskHref(learner.id)}
        oldPageHref={`/review/${data.episodeId}`}
      />
    </div>
  );
}
