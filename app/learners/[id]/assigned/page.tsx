import Link from "next/link";
import { BoardTabs } from "@/components/assigned/BoardTabs";
import { DraftGroups } from "@/components/assigned/DraftGroups";
import { AssignmentTable } from "@/components/practice/AssignmentTable";
import { StudioAssignedTable } from "@/components/studio/StudioAssignedTable";
import { buildBoard, parseWorkTab } from "@/lib/assigned/board";
import { groupDraftsByUnit, openDrafts } from "@/lib/assigned/draftGroups";
import { loadCurriculumCards, loadUnitAuto } from "@/lib/curriculum/load";
import { mainCurriculum } from "@/lib/curriculum/main";
import { loadDraftList } from "@/lib/studio/load";
import { likelyDuplicates } from "@/lib/assigned/duplicates";
import { loadResults } from "@/lib/results/load";
import { assignedBoardCopy as c, learnerWithTrack } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import { maxPagesPerSubmission } from "@/lib/practice/capabilities";
import { loadAssignments } from "@/lib/practice/load";
import { loadStudioAssigned } from "@/lib/studio/assignedLoad";
import { loadTags } from "@/lib/tutorwork/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";
import { revisionsAvailable } from "@/lib/revision/load";

export const dynamic = "force-dynamic";

/** "Bài tập" (hướng B, 26/11; was "Bài đã giao"): every piece of work of one child by what the adult has to do, plus the drafts not given yet. */
export default async function AssignedBoardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string | string[] }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { learner, member } = await requireLearnerPage(id, "practice:write");
  const today = todayVn();
  const [studio, assignments, tags, maxFiles, drafts, revisionsReady] = await Promise.all([
    loadStudioAssigned(learner.id, today).catch(() => null),
    loadAssignments(learner.id),
    loadTags(learner.trackId),
    maxPagesPerSubmission(),
    loadDraftList(learner.id).catch(() => null),
    revisionsAvailable().catch(() => false),
  ]);
  const board = buildBoard(studio, assignments, today);
  const open = drafts ? openDrafts(drafts) : [];
  const counts = { ...board.counts, drafts: open.length };
  // 26/11: the provisional score of each sent test (first attempt), so a test waiting for one question still shows how it went.
  const results = studio ? await loadResults(learner.id, today, studio).catch(() => null) : null;
  const scores = new Map((results?.works ?? []).filter((w) => w.counted).map((w) => [w.instanceId, w.tally]));
  const tab = parseWorkTab(sp.tab, counts);
  const listTab = tab === "drafts" ? null : tab;
  // The Unit statuses of the main curriculum, only to order the drafts (fail soft: groups still show, without "Đã học").
  const statusOf =
    tab === "drafts"
      ? await loadUnitAuto(learner.id)
          .then(async (auto) => mainCurriculum(await loadCurriculumCards(learner.id, auto), auto.mainId)?.progress?.statusOf ?? null)
          .catch(() => null)
      : null;
  const tagLabels = Object.fromEntries(tags.map((t) => [t.key, t.label]));
  const studioRows = listTab ? board.studio[listTab] : [];
  const practiceRows = listTab ? board.practice[listTab] : [];
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4" data-testid="assigned-board" data-tab={tab}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{c.title(learner.alias)}</h1>
          <p className="mt-1 text-sm text-muted">
            {learnerWithTrack(learner.alias, learner.trackId)} · {c.intro}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/learners/${learner.id}/assign`} data-testid="board-new" className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 font-semibold text-white">
            {c.newWork}
          </Link>
          <Link href={`/learners/${learner.id}/results/new`} data-testid="board-result" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-white px-4 text-sm font-semibold text-accent">
            {c.resultLink}
          </Link>
          <Link href={`/learners/${learner.id}/imports/new`} data-testid="board-import" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-white px-4 text-sm font-semibold text-accent">
            {c.importLink}
          </Link>
        </div>
      </div>
      <BoardTabs learnerId={learner.id} tab={tab} counts={counts} />
      <p className="text-sm text-muted">{c.hint[tab]}</p>
      {tab === "drafts" ? (
        drafts === null ? (
          <p role="status" data-testid="board-drafts-failed" className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-muted">{c.draftsFailed}</p>
        ) : (
          <DraftGroups groups={groupDraftsByUnit(open, statusOf)} />
        )
      ) : null}
      {listTab && (board.studioFailed || studioRows.length > 0) ? (
        <div data-testid="board-studio">
          <StudioAssignedTable rows={board.studioFailed ? null : studioRows} title={c.studioList} duplicates={likelyDuplicates(studio ?? [])} scores={scores} learnerId={learner.id} />
        </div>
      ) : null}
      {practiceRows.length > 0 ? (
        <section className="flex flex-col gap-3" data-testid="board-practice" id="assigned-list">
          <h2 className="text-lg font-semibold">{c.practiceList}</h2>
          <AssignmentTable learnerId={learner.id} assignments={practiceRows} tagLabels={tagLabels} viewerMemberId={member.id} maxFiles={maxFiles} today={today} />
        </section>
      ) : null}
      {listTab && !board.studioFailed && studioRows.length === 0 && practiceRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white px-4 py-5 text-muted" data-testid="board-empty">
          {c.empty[listTab ?? "drafts"]}
        </p>
      ) : null}
      {tab === "done" && counts.removed > 0 ? (
        <Link href={`/learners/${learner.id}/assigned?tab=removed`} data-testid="board-removed-link" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {c.removedLink(counts.removed)}
        </Link>
      ) : null}
      <p className="flex flex-wrap gap-x-6 text-sm">
        <Link href={`/learners/${learner.id}/inquiries#assigned`} data-testid="board-topic" className="inline-flex min-h-11 items-center text-accent underline">
          {c.topicLink}
        </Link>
        <Link href={`/review?learner=${learner.id}`} data-testid="board-review" className="inline-flex min-h-11 items-center text-accent underline">
          {c.reviewLink}
        </Link>
        {revisionsReady ? (
          <Link href={`/learners/${learner.id}/revisions`} data-testid="board-revisions" className="inline-flex min-h-11 items-center text-accent underline">
            {c.revisionsLink}
          </Link>
        ) : null}
      </p>
    </div>
  );
}
