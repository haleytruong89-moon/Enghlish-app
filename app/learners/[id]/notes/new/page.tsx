import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { SessionNoteForm } from "@/components/tutor/SessionNoteForm";
import { learnerWithTrack, sessionNotePage } from "@/lib/copy/vi";
import { addDays, todayVn } from "@/lib/inquiries/dates";
import { loadSkillMap } from "@/lib/skillmap/load";
import { loadTargetsView } from "@/lib/targets/loadTargets";
import { loadLastNote, loadTags, loadWeakPoints } from "@/lib/tutorwork/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** "Ghi buổi học" (v2) - tutor or parent. Tags that are due for a re-check are listed beside the form. */
export default async function NewSessionNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { member, learner } = await requireLearnerPage(id, "tutorwork:write");
  const [tags, weak, previous, targets, map] = await Promise.all([
    loadTags(learner.trackId),
    loadWeakPoints(learner.id, "all"),
    loadLastNote(learner.id),
    loadTargetsView(learner.id),
    loadSkillMap(learner.id),
  ]);
  const today = todayVn();

  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} />
      <main className="mx-auto max-w-5xl px-4 py-10" data-testid="session-page">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {sessionNotePage.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{sessionNotePage.title(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        <p className="mt-3 text-muted">{sessionNotePage.intro}</p>
        <div className="mt-6">
          <SessionNoteForm
            learnerId={learner.id}
            tags={tags}
            map={map}
            skills={(targets?.rows ?? []).map((r) => ({ id: r.id, title: r.title }))}
            due={weak.tags.filter((t) => t.recheckDue)}
            previous={previous}
            today={today}
            minDate={addDays(today, -120)}
          />
        </div>
      </main>
    </>
  );
}
