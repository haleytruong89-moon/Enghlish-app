import Link from "next/link";
import { BaselineForm } from "@/components/levels/BaselineForm";
import { learnerWithTrack, levelFormCopy } from "@/lib/copy/vi";
import { loadLevelProfile } from "@/lib/levels/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** "Xác nhận cấp khởi điểm": the child's tutor only (levels:decide; a parent or a student gets 404). */
export default async function BaselinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { learner } = await requireLearnerPage(id, "levels:decide");
  const profile = await loadLevelProfile(learner.id);
  const rows = profile.domains.filter((d) => d.status === "assumed").map((d) => ({ key: d.key, name: d.name, scale: d.scale, assumed: d.assumed }));
  return (
    <>
      <div className="mx-auto max-w-2xl" data-testid="baseline-page">
        <Link href={`/learners/${learner.id}/levels`} className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {levelFormCopy.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{levelFormCopy.baselineTitle(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        {rows.length === 0 ? (
          <p className="mt-4 rounded-xl border border-line bg-white px-4 py-3" data-testid="baseline-done">
            {levelFormCopy.baselineDone}
          </p>
        ) : (
          <>
            <p className="mt-3 text-muted">{levelFormCopy.baselineIntro}</p>
            <BaselineForm learnerId={learner.id} rows={rows} />
          </>
        )}
      </div>
    </>
  );
}
