import Link from "next/link";
import { ImportForm } from "@/components/import/ImportForm";
import { loadUnitChoices } from "@/lib/curriculum/load";
import { importCopy, learnerWithTrack } from "@/lib/copy/vi";
import { deskHref } from "@/lib/shell/paths";
import { loadStudioGate } from "@/lib/studio/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** Nạp bài đã làm (W3): the child's tutor or parent uploads finished paper work + its key; the AI reads it; the tutor confirms on the next screen. Others: 404. */
export default async function NewImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { learner } = await requireLearnerPage(id, "import:upload");
  const [gate, unitChoices] = await Promise.all([loadStudioGate(learner.id), loadUnitChoices(learner.id)]);
  return (
    <div className="mx-auto max-w-3xl" data-testid="import-new-page">
      <Link href={deskHref(learner.id)} className="inline-flex min-h-11 items-center text-sm text-accent underline">
        {importCopy.back}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{importCopy.title}</h1>
      <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
      <p className="mt-3 text-[15px]">{importCopy.intro}</p>
      <p className="mt-1 text-xs text-muted">{importCopy.aiNote}</p>
      <section className="mt-6 rounded-2xl border border-line bg-white p-5">
        <ImportForm learnerId={learner.id} aiAllowed={gate.allowed} aiReason={gate.reason} unitChoices={unitChoices} />
      </section>
    </div>
  );
}
