import { deskHref } from "@/lib/shell/paths";
import Link from "next/link";
import { SessionNoteForm } from "@/components/tutor/SessionNoteForm";
import { learnerWithTrack, sessionNotePage } from "@/lib/copy/vi";
import { addDays, todayVn } from "@/lib/inquiries/dates";
import { loadPickerMap } from "@/lib/skillmap/load";
import { loadTargetsView } from "@/lib/targets/loadTargets";
import { loadTaughtChoices } from "@/lib/curriculum/load";
import { loadSessionFacts } from "@/lib/sessions/load";
import { makeupChoices } from "@/lib/sessions/view";
import { loadLastNote, loadTags, loadWeakPoints } from "@/lib/tutorwork/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";
import { ActionCards } from "@/components/results/ActionCards";
import { resultsCopy } from "@/lib/copy/vi";
import { sessionCards } from "@/lib/results/actions";
import { loadResults } from "@/lib/results/load";

export const dynamic = "force-dynamic";

/** "Ghi buổi học" (v2) - tutor or parent. Tags that are due for a re-check are listed beside the form. */
export default async function NewSessionNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { learner, member } = await requireLearnerPage(id, "tutorwork:write");
  const [tags, weak, previous, targets, map, taughtChoices, facts, results] = await Promise.all([
    loadTags(learner.trackId),
    loadWeakPoints(learner.id, "all"),
    loadLastNote(learner.id),
    loadTargetsView(learner.id),
    loadPickerMap(learner.id),
    loadTaughtChoices(learner.id),
    loadSessionFacts(learner.id).catch(() => null), // after the gate above (tutor or parent of this child)
    loadResults(learner.id, todayVn()).catch(() => null), // 26/11: what to go over in this lesson; never takes the page down
  ]);
  const plan = results ? sessionCards(results.allActions).slice(0, 6) : [];
  const today = todayVn();

  return (
    <>
      <div className="mx-auto max-w-5xl" data-testid="session-page">
        <Link href={deskHref(learner.id)} className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {sessionNotePage.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{sessionNotePage.title(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        <p className="mt-3 text-muted">{sessionNotePage.intro}</p>
        {plan.length > 0 ? (
          <div className="mt-5" data-testid="session-plan">
            <ActionCards id="goi-y-buoi-hoc" title={resultsCopy.sessionTitle} learnerId={learner.id} cards={plan} tagLabels={Object.fromEntries(tags.map((t) => [t.key, t.label]))} role={member.role === "parent" ? "parent" : "tutor"} buttons={false} decisionsReady={results?.decisionsReady ?? false} />
            <p className="mt-1 text-sm text-muted">{resultsCopy.sessionIntro}</p>
          </div>
        ) : null}
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
            taughtChoices={taughtChoices}
            makeupChoices={facts?.billing ? makeupChoices(facts.notes, facts.marks, facts.absences) : []}
          />
        </div>
      </div>
    </>
  );
}
