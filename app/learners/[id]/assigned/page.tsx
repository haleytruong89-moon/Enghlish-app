import Link from "next/link";
import { BoardTabs } from "@/components/assigned/BoardTabs";
import { AssignmentTable } from "@/components/practice/AssignmentTable";
import { StudioAssignedTable } from "@/components/studio/StudioAssignedTable";
import { buildBoard, parseTab } from "@/lib/assigned/board";
import { likelyDuplicates } from "@/lib/assigned/duplicates";
import { loadResults } from "@/lib/results/load";
import { assignedBoardCopy as c, learnerWithTrack } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import { maxPagesPerSubmission } from "@/lib/practice/capabilities";
import { loadAssignments } from "@/lib/practice/load";
import { loadStudioAssigned } from "@/lib/studio/assignedLoad";
import { loadTags } from "@/lib/tutorwork/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** "Bài đã giao" (24/11): follow every piece of work given to one child, by what the adult has to do. The child's tutor or the parent. */
export default async function AssignedBoardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string | string[] }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { learner, member } = await requireLearnerPage(id, "practice:write");
  const today = todayVn();
  const [studio, assignments, tags, maxFiles] = await Promise.all([
    loadStudioAssigned(learner.id, today).catch(() => null),
    loadAssignments(learner.id),
    loadTags(learner.trackId),
    maxPagesPerSubmission(),
  ]);
  const board = buildBoard(studio, assignments, today);
  // 26/11: the provisional score of each sent test (first attempt), so a test waiting for one question still shows how it went.
  const results = studio ? await loadResults(learner.id, today, studio).catch(() => null) : null;
  const scores = new Map((results?.works ?? []).filter((w) => w.counted).map((w) => [w.instanceId, w.tally]));
  const tab = parseTab(sp.tab, board.counts);
  const tagLabels = Object.fromEntries(tags.map((t) => [t.key, t.label]));
  const studioRows = board.studio[tab];
  const practiceRows = board.practice[tab];
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4" data-testid="assigned-board" data-tab={tab}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{c.title(learner.alias)}</h1>
          <p className="mt-1 text-sm text-muted">
            {learnerWithTrack(learner.alias, learner.trackId)} · {c.intro}
          </p>
        </div>
        <Link href={`/learners/${learner.id}/assign`} data-testid="board-new" className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 font-semibold text-white">
          {c.newWork}
        </Link>
      </div>
      <BoardTabs learnerId={learner.id} tab={tab} counts={board.counts} />
      <p className="text-sm text-muted">{c.hint[tab]}</p>
      {board.studioFailed || studioRows.length > 0 ? (
        <div data-testid="board-studio">
          <StudioAssignedTable rows={board.studioFailed ? null : studioRows} title={c.studioList} duplicates={likelyDuplicates(studio ?? [])} scores={scores} />
        </div>
      ) : null}
      {practiceRows.length > 0 ? (
        <section className="flex flex-col gap-3" data-testid="board-practice" id="assigned-list">
          <h2 className="text-lg font-semibold">{c.practiceList}</h2>
          <AssignmentTable learnerId={learner.id} assignments={practiceRows} tagLabels={tagLabels} viewerMemberId={member.id} maxFiles={maxFiles} today={today} />
        </section>
      ) : null}
      {!board.studioFailed && studioRows.length === 0 && practiceRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white px-4 py-5 text-muted" data-testid="board-empty">
          {c.empty[tab]}
        </p>
      ) : null}
      <Link href={`/learners/${learner.id}/inquiries#assigned`} data-testid="board-topic" className="inline-flex min-h-11 items-center text-sm text-accent underline">
        {c.topicLink}
      </Link>
    </div>
  );
}
