import { deskHref } from "@/lib/shell/paths";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WayCards } from "@/components/assign/WayCards";
import { WaysStrip } from "@/components/assign/WaysStrip";
import { parseWay, wayHref } from "@/lib/assign/ways";
import { AssignForm } from "@/components/practice/AssignForm";
import { AssignmentTable } from "@/components/practice/AssignmentTable";
import { readPrefill } from "@/lib/prefill";
import { assignPage, assignWaysCopy, learnerWithTrack } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import { loadUnitChoices } from "@/lib/curriculum/load";
import { loadAssignments } from "@/lib/practice/load";
import { loadPickerMap } from "@/lib/skillmap/load";
import { loadFrames, loadTags } from "@/lib/tutorwork/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** "Giao bài luyện": give a link or a PDF to one child (tutor or parent), and follow what came back. Same screen for both tutors. */
export default async function AssignPracticePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const prefill = readPrefill(sp);
  const way = parseWay(sp.way);
  const { learner } = await requireLearnerPage(id, "practice:write");
  // The other two ways live on their own pages (the forms are not copied); this page only points there.
  if (way === "studio" || way === "topic") redirect(wayHref(learner.id, way, prefill));
  const kind = way === "link" || way === "pdf" ? way : null;
  const [tags, frames, assignments, map, unitChoices] = await Promise.all([
    loadTags(learner.trackId),
    loadFrames(learner.trackId, learner.id),
    loadAssignments(learner.id),
    loadPickerMap(learner.id),
    loadUnitChoices(learner.id),
  ]);
  const tagLabels = Object.fromEntries(tags.map((t) => [t.key, t.label]));
  const head = (
    <>
      <Link href={deskHref(learner.id)} className="inline-flex min-h-11 items-center text-sm text-accent underline">
        {assignPage.back}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{assignWaysCopy.title(learner.alias)}</h1>
      <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
    </>
  );
  const list = (
    <section className="flex flex-col gap-3" aria-label={assignWaysCopy.listTitle} data-testid="assigned-list">
      <h2 className="text-lg font-semibold">{assignWaysCopy.listTitle}</h2>
      <AssignmentTable learnerId={learner.id} assignments={assignments} tagLabels={tagLabels} today={todayVn()} />
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
            <AssignForm learnerId={learner.id} alias={learner.alias} tags={tags} frames={frames} today={todayVn()} map={map} prefill={prefill} unitChoices={unitChoices} fixedKind={kind} />
            {list}
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-muted">{assignWaysCopy.intro}</p>
          <div className="mt-6 flex flex-col gap-8">
            <WayCards learnerId={learner.id} prefill={prefill} />
            {list}
            <p className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <Link href={`/studio/new?learner=${learner.id}#drafts`} data-testid="see-studio" className="inline-flex min-h-11 items-center text-accent underline">
                {assignWaysCopy.seeStudio}
              </Link>
              <Link href={`/learners/${learner.id}/inquiries#assigned`} data-testid="see-topic" className="inline-flex min-h-11 items-center text-accent underline">
                {assignWaysCopy.seeTopic}
              </Link>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
