import Link from "next/link";
import { PointMap } from "@/components/points/PointMap";
import { PointRebuildButton } from "@/components/points/PointRebuildButton";
import { learnerWithTrack, pointMapCopy } from "@/lib/copy/vi";
import { loadPointMap } from "@/lib/points/load";
import { deskHref } from "@/lib/shell/paths";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** Bản đồ kiến thức (W3): the level of every knowledge point of one child, with the evidence per answer. Tutor and parent; students and outsiders get 404. */
export default async function KnowledgeMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { learner } = await requireLearnerPage(id, "points:read");
  const map = await loadPointMap(learner.id);
  return (
    <div className="mx-auto max-w-[1240px]" data-testid="knowledge-page">
      <Link href={deskHref(learner.id)} className="inline-flex min-h-11 items-center text-sm text-accent underline">
        {pointMapCopy.back}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{pointMapCopy.title}</h1>
      <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
      <p className="mt-3 max-w-3xl text-[15px]">{pointMapCopy.intro(learner.alias)}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Link href={`/learners/${learner.id}/imports/new`} data-testid="knowledge-import-link" className="inline-flex min-h-11 items-center rounded-lg border border-accent px-4 text-sm font-semibold text-accent">
          {pointMapCopy.importLink}
        </Link>
      </div>
      {map === null ? (
        <p className="mt-6 rounded-xl border border-line bg-white px-5 py-4" data-testid="point-map-not-ready">
          {pointMapCopy.notReady}
        </p>
      ) : (
        <>
          {map.policyVersion ? <p className="mt-3 text-xs text-muted">{pointMapCopy.policy(map.policyVersion)}</p> : null}
          <PointMap map={map} />
          <PointRebuildButton learnerId={learner.id} />
        </>
      )}
    </div>
  );
}
