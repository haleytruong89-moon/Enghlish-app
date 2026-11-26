import { deskHref } from "@/lib/shell/paths";
import Link from "next/link";
import { OpenFoldLink } from "@/components/sessions/OpenFoldLink";
import { notFound, redirect } from "next/navigation";
import { SessionStats } from "@/components/sessions/SessionStats";
import { LessonNotes } from "@/components/review/LessonNotes";
import { learnerWithTrack, notesPage, sessionStatsCopy } from "@/lib/copy/vi";
import { addDays, todayVn } from "@/lib/inquiries/dates";
import { authorizeLearnerPage } from "@/lib/review/access";
import { loadNotesPage } from "@/lib/review/load";
import { getAuthUser } from "@/lib/auth/session";
import { loadCurriculumCards } from "@/lib/curriculum/load";
import { effectiveKinds, sessionDays } from "@/lib/sessions/count";
import { loadSessionFacts } from "@/lib/sessions/load";
import { makeupChoices, unitTitleOf } from "@/lib/sessions/view";

export const dynamic = "force-dynamic";

/** Lesson notes of one child. Tutor: write and edit; parent: the notes the tutor shared. Students and outsiders: plain 404. */
export default async function NotesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ nghi?: string | string[] }> }) {
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
  // 3B: the kind of each current note (notes of this page only), when the tables of 0030 can be read.
  const marks = facts?.billing
    ? Object.fromEntries([...effectiveKinds(facts.notes, facts.marks)].map(([id, m]) => [id, { kind: m?.kind ?? "regular", reason: m?.reason ?? null, makeupFor: m?.makeupFor ?? null }]))
    : undefined;

  const choicesByNote = facts?.billing
    ? Object.fromEntries(notes.filter((n) => marks?.[n.id]?.kind === "makeup").map((n) => [n.id, makeupChoices(facts.notes, facts.marks, facts.absences, n.id)]))
    : {};

  const sp = (await searchParams) ?? {};
  const absenceOpen = (Array.isArray(sp.nghi) ? sp.nghi[0] : sp.nghi) === "1";
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
          // Bản 3 (26/11): the two things done here, big and side by side at the top.
          <div role="group" aria-label={notesPage.actionsLabel} className="mt-4 flex flex-wrap gap-3">
            <Link href={`/learners/${learner.id}/notes/new`} data-testid="notes-write-new"
              className="flex min-h-16 flex-[2_1_16rem] flex-col justify-center rounded-2xl bg-accent px-4 py-2 text-white no-underline shadow-[0_2px_0_#1f4439] hover:bg-[#1f4439]">
              <b className="text-[17px]">{notesPage.writeNew}</b>
              <span className="text-sm">{notesPage.writeNewHint}</span>
            </Link>
            {facts?.billing ? (
              <OpenFoldLink href={`/learners/${learner.id}/notes?nghi=1#ghi-nghi`} foldId="ghi-nghi" testId="notes-absence"
                className="flex min-h-16 flex-[1_1_12rem] flex-col justify-center rounded-2xl border-2 border-accent bg-white px-4 py-2 text-accent no-underline hover:bg-[#eef5f1]">
                <b className="text-base">{notesPage.absenceAction}</b>
                <span className="text-sm">{notesPage.absenceHint}</span>
              </OpenFoldLink>
            ) : null}
          </div>
        ) : null}
        {facts ? (
          <SessionStats learnerId={learner.id} days={sessionDays(facts.notes, facts.taught, unitTitleOf(cards), facts.marks)} today={today} cards={cards} absences={facts.absences} billing={facts.billing} absenceOpen={absenceOpen} />
        ) : (
          <p className="mt-6 rounded-xl border border-line bg-white px-5 py-4 text-sm text-muted" data-testid="sessions-unreadable">{sessionStatsCopy.unreadable}</p>
        )}
        <h2 className="mt-8 text-lg font-semibold">{notesPage.link}</h2>
        <LessonNotes learnerId={learner.id} notes={notes} targets={targets} canWrite={canWrite} memberId={member.id} today={today} minDate={addDays(today, -120)} tagLabels={tagLabels} marks={marks} makeupChoices={facts?.billing ? makeupChoices(facts.notes, facts.marks, facts.absences) : []} makeupChoicesByNote={choicesByNote} />
      </div>
    </>
  );
}
