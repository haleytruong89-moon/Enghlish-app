import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { RevisionList } from "@/components/revision/RevisionList";
import { appFeedback, learnerWithTrack, revisionReviewCopy } from "@/lib/copy/vi";
import { loadRevisionListSoft } from "@/lib/revision/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** "Bài đã sửa" of one child (spec §4, 3-c): parent and tutor read every before–after pair; students and outsiders get 404. */
export default async function RevisionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { member, learner } = await requireLearnerPage(id, "tutorwork:read");
  // Fail soft: if the books cannot be read (migration 0021 not applied yet) the page says so neutrally instead of a 500.
  const items = await loadRevisionListSoft(learner.id);
  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} feedbackScreen={appFeedback.screens.revisions} />
      <main className="mx-auto max-w-4xl px-4 py-10" data-testid="revisions-page">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {revisionReviewCopy.backHome}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{revisionReviewCopy.listTitle(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        {items === null ? null : <p className="mt-3 text-muted">{revisionReviewCopy.listIntro}</p>}
        {items === null ? (
          <p className="mt-4 rounded-xl border border-line bg-white px-5 py-4" data-testid="revisions-unavailable">
            {revisionReviewCopy.unavailable}
          </p>
        ) : (
          <RevisionList learnerId={learner.id} items={items} />
        )}
      </main>
    </>
  );
}
