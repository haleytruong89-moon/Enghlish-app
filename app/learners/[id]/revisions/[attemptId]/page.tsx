import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { RevisionReview } from "@/components/revision/RevisionReview";
import { learnerWithTrack, revisionReviewCopy } from "@/lib/copy/vi";
import { loadRevisionView } from "@/lib/revision/load";
import { loadPickerMap } from "@/lib/skillmap/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";
import { UUID_RE } from "@/lib/work/schemas";

export const dynamic = "force-dynamic";

/** One before–after pair, read-only (spec 3-c). The pair must belong to this child, else 404. */
export default async function RevisionPairPage({ params }: { params: Promise<{ id: string; attemptId: string }> }) {
  const { id, attemptId } = await params;
  const { member, learner } = await requireLearnerPage(id, "tutorwork:read");
  if (!UUID_RE.test(attemptId)) notFound();
  const view = await loadRevisionView(attemptId, member.id);
  if (!view || view.learnerId !== learner.id) notFound();
  const map = await loadPickerMap(learner.id).catch(() => null);
  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} />
      <main className="mx-auto max-w-5xl px-4 py-10" data-testid="revision-pair-page">
        <Link href={`/learners/${learner.id}/revisions`} className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {revisionReviewCopy.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{view.titleVi}</h1>
        <p className="mt-1 text-sm text-muted">
          {learnerWithTrack(learner.alias, learner.trackId)} · {revisionReviewCopy.viewerNote}{" "}
          <Link href={`/review/${view.episodeId}`} className="text-accent underline">
            {revisionReviewCopy.openReview}
          </Link>
        </p>
        <div className="mt-6">
          <RevisionReview view={view} map={map} readOnly />
        </div>
      </main>
    </>
  );
}
