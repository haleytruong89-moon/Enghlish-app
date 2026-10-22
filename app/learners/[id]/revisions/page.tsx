import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { RevisionList } from "@/components/revision/RevisionList";
import { learnerWithTrack, revisionReviewCopy } from "@/lib/copy/vi";
import { loadRevisionList } from "@/lib/revision/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** "Bài đã sửa" of one child (spec §4, 3-c): parent and tutor read every before–after pair; students and outsiders get 404. */
export default async function RevisionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { member, learner } = await requireLearnerPage(id, "tutorwork:read");
  const items = await loadRevisionList(learner.id);
  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} />
      <main className="mx-auto max-w-4xl px-4 py-10" data-testid="revisions-page">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {revisionReviewCopy.backHome}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{revisionReviewCopy.listTitle(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        <p className="mt-3 text-muted">{revisionReviewCopy.listIntro}</p>
        <RevisionList learnerId={learner.id} items={items} />
      </main>
    </>
  );
}
