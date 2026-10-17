import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { PendingTags } from "@/components/tutor/PendingTags";
import { ResultForm } from "@/components/tutor/ResultForm";
import { learnerWithTrack, resultPage } from "@/lib/copy/vi";
import { addDays, todayVn } from "@/lib/inquiries/dates";
import { loadFrames, loadTags, loadUntagged } from "@/lib/tutorwork/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** "Ghi kết quả bài": tutor or parent. In-class results are tutor-only (the database refuses a parent as well). */
export default async function NewResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { member, learner } = await requireLearnerPage(id, "tutorwork:write");
  const role = member.role === "tutor" ? "tutor" : "parent";
  const [frames, tags, pending] = await Promise.all([loadFrames(learner.trackId), loadTags(learner.trackId), loadUntagged(learner.id, { role, memberId: member.id })]);
  const today = todayVn();

  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} />
      <main className="mx-auto max-w-4xl px-4 py-10" data-testid="result-page">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {resultPage.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{resultPage.title(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        <p className="mt-3 text-muted">{resultPage.intro}</p>
        <div className="mt-6 flex flex-col gap-8">
          <ResultForm learnerId={learner.id} frames={frames} tags={tags} canClass={role === "tutor"} today={today} minDate={addDays(today, -120)} />
          <PendingTags learnerId={learner.id} items={pending} tags={tags} isParent={role === "parent"} />
        </div>
      </main>
    </>
  );
}
