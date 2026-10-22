import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { ExternalResultForm } from "@/components/levels/ExternalResultForm";
import { externalCopy, learnerWithTrack } from "@/lib/copy/vi";
import { addDays, todayVn } from "@/lib/inquiries/dates";
import { loadLevelProfile } from "@/lib/levels/load";
import { EXAM_DAYS_BACK } from "@/lib/levels/types";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** "Thêm kết quả thi ngoài": tutor or parent of the child (tutorwork:write). */
export default async function ExternalNewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { id } = await params;
  const { edit } = await searchParams;
  const { member, learner } = await requireLearnerPage(id, "tutorwork:write");
  const profile = await loadLevelProfile(learner.id);
  const today = todayVn();
  // A2: ?edit=<id> corrects a live entry (the form saves a new one that replaces it). An entry already corrected is not offered again.
  const target = edit ? (profile.externalResults.find((e) => e.id === edit) ?? null) : null;
  const stale = Boolean(edit) && !target;
  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} />
      <main className="mx-auto max-w-2xl px-4 py-10" data-testid="external-page">
        <Link href={`/learners/${learner.id}/levels`} className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {externalCopy.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{target ? externalCopy.editTitle(learner.alias) : externalCopy.title(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        {stale ? (
          <p className="mt-4 rounded-xl border border-line bg-white px-4 py-3" data-testid="external-stale">
            {externalCopy.alreadyCorrected}
          </p>
        ) : (
          <>
            <p className="mt-3 text-muted">{target ? externalCopy.editIntro : externalCopy.intro}</p>
            <ExternalResultForm
              learnerId={learner.id}
              domains={profile.domains.map((d) => ({ key: d.key, name: d.name }))}
              today={today}
              minDate={addDays(today, -EXAM_DAYS_BACK)}
              edit={target ? { id: target.id, exam: target.exam, takenOn: target.takenOn, scoreText: target.scoreText, domains: target.domains, note: target.note } : undefined}
            />
          </>
        )}
      </main>
    </>
  );
}
