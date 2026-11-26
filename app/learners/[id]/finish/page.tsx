import Link from "next/link";
import { redirect } from "next/navigation";
import { finishCopy as c } from "@/lib/copy/vi";
import { tabOfPractice } from "@/lib/assigned/board";
import { loadAssignments } from "@/lib/practice/load";
import { loadFinishQueue } from "@/lib/finish/load";
import { finishHref } from "@/lib/finish/paths";
import { todayVn } from "@/lib/inquiries/dates";
import { deskHref } from "@/lib/shell/paths";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/**
 * L1 · the queue of one child (the "Chấm bài" button): opens the oldest app submission still needing an adult; else the link / PDF work
 * waiting on Bài tập › Cần chấm; else says nothing is left. Tutor or parent.
 */
export default async function FinishQueuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { learner, member } = await requireLearnerPage(id, "work:review");
  const queue = await loadFinishQueue(learner.id, member.id, todayVn()).catch(() => []);
  if (queue[0]) redirect(finishHref(learner.id, queue[0].attemptId));
  // Hướng B: "Chấm bài" also counts link / PDF work waiting for a result; with no app work left, that is where the button leads.
  const practice = await loadAssignments(learner.id, { units: false }).catch(() => []);
  if (practice.some((a) => tabOfPractice(a) === "need")) redirect(`/learners/${learner.id}/assigned?tab=need`);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3" data-testid="finish-empty">
      <h1 className="text-2xl font-bold">{c.emptyTitle}</h1>
      <p className="text-muted">{c.emptyBody}</p>
      <Link href={deskHref(learner.id)} className="inline-flex min-h-11 items-center self-start rounded-xl bg-accent px-4 font-semibold text-white no-underline">{c.backWhenEmpty}</Link>
    </div>
  );
}
