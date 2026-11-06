import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { AssignForm } from "@/components/practice/AssignForm";
import { AssignmentTable } from "@/components/practice/AssignmentTable";
import { assignPage, learnerWithTrack } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import { loadAssignments } from "@/lib/practice/load";
import { loadPickerMap } from "@/lib/skillmap/load";
import { loadFrames, loadTags } from "@/lib/tutorwork/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** "Giao bài luyện": give a link or a PDF to one child (tutor or parent), and follow what came back. Same screen for both tutors. */
export default async function AssignPracticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { member, learner } = await requireLearnerPage(id, "practice:write");
  const [tags, frames, assignments, map] = await Promise.all([
    loadTags(learner.trackId),
    loadFrames(learner.trackId, learner.id),
    loadAssignments(learner.id),
    loadPickerMap(learner.id),
  ]);
  const tagLabels = Object.fromEntries(tags.map((t) => [t.key, t.label]));
  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} />
      <main className="mx-auto max-w-4xl px-4 py-10" data-testid="assign-page">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {assignPage.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{assignPage.title(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        <p className="mt-3 text-muted">{assignPage.intro}</p>
        <div className="mt-6 flex flex-col gap-8">
          <AssignForm learnerId={learner.id} alias={learner.alias} tags={tags} frames={frames} today={todayVn()} map={map} />
          <section className="flex flex-col gap-3" aria-label={assignPage.listTitle}>
            <h2 className="text-lg font-semibold">{assignPage.listTitle}</h2>
            <AssignmentTable learnerId={learner.id} assignments={assignments} tagLabels={tagLabels} today={todayVn()} />
          </section>
        </div>
      </main>
    </>
  );
}
