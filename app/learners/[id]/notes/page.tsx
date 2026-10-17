import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { LessonNotes } from "@/components/review/LessonNotes";
import { learnerWithTrack, notesPage } from "@/lib/copy/vi";
import { addDays, todayVn } from "@/lib/inquiries/dates";
import { authorizeLearnerPage } from "@/lib/review/access";
import { loadNotesPage } from "@/lib/review/load";
import { createUserClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Lesson notes of one child. Tutor: write and edit; parent: the notes the tutor shared. Students and outsiders: plain 404. */
export default async function NotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const access = await authorizeLearnerPage(user, id, "notes:read");
  if (access.kind === "login") redirect("/login");
  if (access.kind === "not-found") notFound();

  const { member, learner } = access.grant;
  const canWrite = member.role === "tutor";
  const { notes, targets, tagLabels } = await loadNotesPage(learner.id, learner.trackId);
  const today = todayVn();

  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent underline">
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
        <LessonNotes learnerId={learner.id} notes={notes} targets={targets} canWrite={canWrite} memberId={member.id} today={today} minDate={addDays(today, -120)} tagLabels={tagLabels} />
      </main>
    </>
  );
}
