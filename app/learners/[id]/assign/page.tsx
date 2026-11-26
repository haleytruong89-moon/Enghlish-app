import { deskHref } from "@/lib/shell/paths";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WayCards } from "@/components/assign/WayCards";
import { WaysStrip } from "@/components/assign/WaysStrip";
import { parseWay, wayHref } from "@/lib/assign/ways";
import { AssignForm } from "@/components/practice/AssignForm";
import { DraftGroups } from "@/components/assigned/DraftGroups";
import { draftBoard } from "@/lib/assigned/draftGroups";
import { loadDraftUnitStatus } from "@/lib/assigned/draftStatus";
import { readPrefill } from "@/lib/prefill";
import { assignPage, assignWaysCopy, learnerWithTrack } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import { loadUnitChoices } from "@/lib/curriculum/load";
import { loadPickerMap } from "@/lib/skillmap/load";
import { loadDraftList } from "@/lib/studio/load";
import { loadStudioAssigned } from "@/lib/studio/assignedLoad";
import { loadAssignments } from "@/lib/practice/load";
import { openTitles } from "@/lib/assigned/duplicates";
import { loadFrames, loadTags } from "@/lib/tutorwork/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/**
 * "Giao bài" (24/11: only to CREATE work): the four ways, or the link / PDF form, and the Studio drafts not given yet. What was given and
 * what came back is followed on "Bài đã giao" (/learners/[id]/assigned). Tutor of the child or parent.
 */
export default async function AssignPracticePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const prefill = readPrefill(sp);
  const way = parseWay(sp.way);
  const { learner } = await requireLearnerPage(id, "practice:write");
  // The other two ways live on their own pages (the forms are not copied); this page only points there.
  if (way === "studio" || way === "topic") redirect(wayHref(learner.id, way, prefill));
  const kind = way === "link" || way === "pdf" ? way : null;
  const [tags, frames, map, unitChoices, drafts, studio, assignments, unitStatus] = await Promise.all([
    loadTags(learner.trackId),
    loadFrames(learner.trackId, learner.id),
    loadPickerMap(learner.id),
    loadUnitChoices(learner.id),
    kind ? Promise.resolve([]) : loadDraftList(learner.id).catch(() => []),
    // Only for the "same title" warning of the link / PDF form: a failed read = no warning.
    kind ? loadStudioAssigned(learner.id, todayVn()).catch(() => null) : Promise.resolve(null),
    kind ? loadAssignments(learner.id).catch(() => []) : Promise.resolve([]),
    kind ? Promise.resolve(null) : loadDraftUnitStatus(learner.id),
  ]);
  const head = (
    <>
      <Link href={deskHref(learner.id)} className="inline-flex min-h-11 items-center text-sm text-accent underline">
        {assignPage.back}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{assignWaysCopy.title(learner.alias)}</h1>
      <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
      <p className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#e3ece8] px-4 py-1 text-[15px] text-[#1f4439]" data-testid="follow-banner">
        <span>{assignWaysCopy.followBanner}</span>
        <Link href={`/learners/${learner.id}/assigned`} data-testid="follow-link" className="inline-flex min-h-11 items-center font-semibold underline">
          {assignWaysCopy.followLink}
        </Link>
      </p>
    </>
  );
  // Hướng B v2: drafts not given yet come FIRST (approved ones on top, one click from giving), then the ways to make a new piece.
  const board = draftBoard(drafts, unitStatus);
  const hasDrafts = board.ready.length > 0 || board.groups.length > 0;
  const draftsBlock = hasDrafts ? (
    <div data-testid="assign-drafts">
      <DraftGroups board={board} />
      <p className="mt-2 text-sm text-muted" data-testid="assign-drafts-help">{assignWaysCopy.draftsHelp}</p>
    </div>
  ) : null;
  const ways = (
    <section id="ways" aria-labelledby="ways-title" className="scroll-mt-4">
      {hasDrafts ? <h2 id="ways-title" className="mb-2 text-lg font-semibold">{assignWaysCopy.newTitle}</h2> : <h2 id="ways-title" className="sr-only">{assignWaysCopy.newTitle}</h2>}
      <WayCards learnerId={learner.id} prefill={prefill} />
    </section>
  );
  return (
    <div className="mx-auto max-w-4xl" data-testid="assign-page">
      {head}
      {kind ? (
        <>
          <WaysStrip learnerId={learner.id} current={kind} prefill={prefill} />
          <p className="mt-3 text-muted">{assignPage.intro}</p>
          <div className="mt-6 flex flex-col gap-8">
            <AssignForm key={kind} learnerId={learner.id} alias={learner.alias} tags={tags} frames={frames} today={todayVn()} map={map} prefill={prefill} unitChoices={unitChoices} fixedKind={kind} openTitles={openTitles(studio, assignments)} />
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-muted">
            <span>{hasDrafts ? assignWaysCopy.introDrafts : assignWaysCopy.intro}</span>
            {hasDrafts ? (
              <a href="#ways" data-testid="assign-new-link" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-white px-4 text-sm font-semibold text-accent no-underline hover:border-accent">{assignWaysCopy.newLink}</a>
            ) : null}
          </p>
          <div className="mt-6 flex flex-col gap-8">
            {prefill ? ways : null}
            {draftsBlock}
            {prefill ? null : ways}
            <p className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <Link href={`/studio/new?learner=${learner.id}#drafts`} data-testid="see-studio" className="inline-flex min-h-11 items-center text-accent underline">
                {assignWaysCopy.seeStudio}
              </Link>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
