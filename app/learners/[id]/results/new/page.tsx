import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { PendingTags } from "@/components/tutor/PendingTags";
import { ResultForm } from "@/components/tutor/ResultForm";
import { learnerWithTrack, resultPage } from "@/lib/copy/vi";
import { addDays, todayVn } from "@/lib/inquiries/dates";
import { loadAssignments } from "@/lib/practice/load";
import { loadPickerMap } from "@/lib/skillmap/load";
import { loadFrames, loadResultForEdit, loadTags, loadUntagged } from "@/lib/tutorwork/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** "Ghi kết quả bài": tutor or parent. In-class results are tutor-only (the database refuses a parent as well). */
export default async function NewResultPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ assignment?: string; again?: string }> }) {
  const { id } = await params;
  const { assignment, again } = await searchParams;
  const { member, learner } = await requireLearnerPage(id, "tutorwork:write");
  const role = member.role === "tutor" ? "tutor" : "parent";
  const [frames, tags, pending, allAssignments, map] = await Promise.all([
    loadFrames(learner.trackId, learner.id),
    loadTags(learner.trackId),
    loadUntagged(learner.id, { role, memberId: member.id }),
    loadAssignments(learner.id),
    loadPickerMap(learner.id),
  ]);
  // Open assignments only: not retracted, and not yet recorded (unless this very one was asked for, e.g. to record a second attempt).
  const assignments = allAssignments.filter((a) => !a.retractedAt && (a.resultId === null || a.id === assignment));
  const initialAssignmentId = assignment && assignments.some((a) => a.id === assignment) ? assignment : null;
  // An assignment that already has a result opens in "Sửa kết quả" (the new result replaces the live one), unless ?again=1 asks for one more attempt.
  const picked = assignments.find((a) => a.id === initialAssignmentId);
  const supersede = picked?.resultId && again !== "1" ? await loadResultForEdit(learner.id, picked.resultId) : null;
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
          <ResultForm
            learnerId={learner.id}
            frames={frames}
            tags={tags}
            map={map}
            canClass={role === "tutor"}
            today={today}
            minDate={addDays(today, -120)}
            assignments={assignments}
            initialAssignmentId={initialAssignmentId}
            supersede={supersede}
            initialRetry={again === "1" && Boolean(picked?.resultId)}
          />
          <PendingTags learnerId={learner.id} items={pending} tags={tags} map={map} isParent={role === "parent"} />
        </div>
      </main>
    </>
  );
}
