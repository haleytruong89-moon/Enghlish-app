import Link from "next/link";
import { IntakeCard } from "@/components/workdesk/IntakeCard";
import { TeachingNotesCard } from "@/components/workdesk/TeachingNotesCard";
import { ThenNowPicker } from "@/components/workdesk/ThenNowPicker";
import { learnerWithTrack, profilePage, teachingNotes, thenNowPickerCopy } from "@/lib/copy/vi";
import { loadLevelProfile } from "@/lib/levels/load";
import { levelsAction } from "@/lib/levels/view";
import { loadThenNowCandidates } from "@/lib/thennow/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";
import { loadIntake, loadTeachingNotes } from "@/lib/workdesk/load";

export const dynamic = "force-dynamic";

/**
 * Hồ sơ học sinh (hướng B, 26/11): what the tutor keeps about the child — Hồ sơ đầu vào, Ghi chú dạy học, "Ngày ấy – bây giờ". Moved here
 * from Hồ sơ cấp; same gate, same cards, same rules (only the child's tutor writes; the parent reads). Students get 404 in the layout.
 */
export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { member, learner } = await requireLearnerPage(id, "tutorwork:read");
  const [profile, notes, intake, thenNow] = await Promise.all([
    loadLevelProfile(learner.id).catch(() => null), // only for the intake card's "Bước tiếp": never takes the page down
    loadTeachingNotes(learner.id),
    loadIntake(learner.id),
    loadThenNowCandidates(learner.id),
  ]);
  const canDecide = member.role === "tutor";
  return (
    <div className="mx-auto max-w-4xl" data-testid="profile-page">
      <h1 className="text-2xl font-bold">{profilePage.title(learner.alias)}</h1>
      <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
      <p className="mt-3 text-muted">{profilePage.intro}</p>
      <Link href={`/learners/${learner.id}/levels`} data-testid="profile-levels-link" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent underline">
        {profilePage.levelsLink}
      </Link>
      {intake.available && notes.available ? (
        <>
          <IntakeCard learnerId={learner.id} view={intake.data} canEdit={canDecide} levelsAssumed={canDecide && profile !== null && levelsAction(profile.domains) === "confirm"} domains={(profile?.domains ?? []).map((d) => ({ key: d.key, name: d.name }))} />
          <TeachingNotesCard learnerId={learner.id} alias={learner.alias} view={notes.data} canEdit={canDecide} />
        </>
      ) : (
        <p role="status" data-testid="workdesk-unavailable" className="mt-6 rounded-xl border border-line bg-white px-5 py-3 text-sm text-muted">
          {teachingNotes.unavailable}
        </p>
      )}
      {thenNow.available ? (
        <ThenNowPicker learnerId={learner.id} alias={learner.alias} view={thenNow.data} canEdit={canDecide} />
      ) : (
        <p role="status" data-testid="then-now-unavailable" className="mt-6 rounded-xl border border-line bg-white px-5 py-3 text-sm text-muted">
          {thenNow.failed ? thenNowPickerCopy.loadFailed : thenNowPickerCopy.unavailable}
        </p>
      )}
    </div>
  );
}
