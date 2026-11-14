import { deskHref } from "@/lib/shell/paths";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SessionStats } from "@/components/sessions/SessionStats";
import { LessonNotes } from "@/components/review/LessonNotes";
import { learnerWithTrack, notesPage, sessionStatsCopy } from "@/lib/copy/vi";
import { addDays, todayVn } from "@/lib/inquiries/dates";
import { authorizeLearnerPage } from "@/lib/review/access";
import { loadNotesPage } from "@/lib/review/load";
import { getAuthUser } from "@/lib/auth/session";
import { loadCurriculumCards } from "@/lib/curriculum/load";
import { sessionDays } from "@/lib/sessions/count";
import { loadSessionFacts } from "@/lib/sessions/load";
import { unitTitleOf } from "@/lib/sessions/view";

export const dynamic = "force-dynamic";

/** Lesson notes of one child. Tutor: write and edit; parent: the notes the tutor shared. Students and outsiders: plain 404. */
export default async function NotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthUser();

  const access = await authorizeLearnerPage(user, id, "notes:read");
  if (access.kind === "login") redirect("/login");
  if (access.kind === "not-found") notFound();

  const { member, learner } = access.grant;
  const canWrite = member.role === "tutor";
  // Stats read after the gate above (admin client, same number for tutor and parent; plan U9). The cards only name the Units.
  const [{ notes, targets, tagLabels }, facts, cards] = await Promise.all([
    loadNotesPage(learner.id, learner.trackId),
    loadSessionFacts(learner.id).catch(() => null),
    loadCurriculumCards(learner.id).catch(() => []),
  ]);
  const today = todayVn();

  return (
    <>
      <div className="mx-auto max-w-2xl">
        <Link href={deskHref(learner.id)} className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {notesPage.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{notesPage.title(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        <p className="mt-4 text-muted">{canWrite ? notesPage.intro : notesPage.introParent}</p>
        {member.role !== "student" ? (
          <Link href={`/learners/${learner.id}/notes/new`} data-testid="notes-write-new" className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent">
            {notesPage.writeNew}
          </Link>
        ) : null}
        {facts ? (
          <SessionStats learnerId={learner.id} days={sessionDays(facts.notes, facts.taught, unitTitleOf(cards))} today={today} cards={cards} />
        ) : (
          <p className="mt-6 rounded-xl border border-line bg-white px-5 py-4 text-sm text-muted" data-testid="sessions-unreadable">{sessionStatsCopy.unreadable}</p>
        )}
        <h2 className="mt-8 text-lg font-semibold">{notesPage.link}</h2>
        <LessonNotes learnerId={learner.id} notes={notes} targets={targets} canWrite={canWrite} memberId={member.id} today={today} minDate={addDays(today, -120)} tagLabels={tagLabels} />
      </div>
    </>
  );
}
