import Link from "next/link";
import { MainCurriculumPicker } from "@/components/roadmap/MainCurriculumPicker";
import { MilestoneList } from "@/components/roadmap/MilestoneList";
import { ProposalList } from "@/components/roadmap/ProposalList";
import { learnerWithTrack, roadmapCopy } from "@/lib/copy/vi";
import { loadRoadmap } from "@/lib/roadmap/load";
import { summitOf } from "@/lib/roadmap/visible";
import { deskHref } from "@/lib/shell/paths";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/**
 * Lộ trình (W4a): the milestones on the child's mountain. The child's tutor places / confirms / edits / removes them; the parent only reads
 * (no buttons; the SQL refuses a parent as well). Students and outsiders get a plain 404.
 */
export default async function RoadmapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { learner, member } = await requireLearnerPage(id, "roadmap:read");
  const canWrite = member.role === "tutor";
  let loaded: Awaited<ReturnType<typeof loadRoadmap>> | null = null;
  try {
    loaded = await loadRoadmap(learner.id);
  } catch {
    loaded = null;
  }
  return (
    <div className="mx-auto max-w-[980px]" data-testid="roadmap-page">
      <Link href={deskHref(learner.id)} className="inline-flex min-h-11 items-center text-sm text-accent underline">{roadmapCopy.back}</Link>
      <h1 className="mt-2 text-2xl font-bold">{roadmapCopy.title(learner.alias)}</h1>
      <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
      <p className="mt-3 max-w-3xl text-[15px]">{roadmapCopy.intro}</p>
      {!canWrite ? <p className="mt-3 rounded-xl border border-line bg-white px-4 py-3 text-sm font-medium" data-testid="roadmap-readonly">{roadmapCopy.readOnly}</p> : null}
      {loaded === null ? (
        <p className="mt-6 rounded-xl border border-line bg-white px-5 py-4" data-testid="roadmap-failed">{roadmapCopy.loadFailed}</p>
      ) : loaded.kind === "unavailable" ? (
        <p className="mt-6 rounded-xl border border-line bg-white px-5 py-4" data-testid="roadmap-unavailable">{roadmapCopy.unavailable}</p>
      ) : (
        <div className="mt-5 flex flex-col gap-4">
          <MainCurriculumPicker learnerId={learner.id} curricula={loaded.view.curricula} mainId={loaded.view.mainId} chosen={loaded.view.mainChosen} canWrite={canWrite} />
          <ProposalList
            learnerId={learner.id} proposals={loaded.view.proposals} curricula={loaded.view.curricula} mainId={loaded.view.mainId} canWrite={canWrite}
            summitTitle={summitOf(loaded.view.cards)?.title ?? null}
          />
          <MilestoneList learnerId={learner.id} cards={loaded.view.cards} curricula={loaded.view.curricula} mainId={loaded.view.mainId} canWrite={canWrite} orphanIds={loaded.view.orphanIds} />
        </div>
      )}
    </div>
  );
}
