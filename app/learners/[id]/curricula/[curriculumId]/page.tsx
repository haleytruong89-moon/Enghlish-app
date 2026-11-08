import Link from "next/link";
import { notFound } from "next/navigation";
import { CoverageBar } from "@/components/curriculum/CoverageBar";
import { UnitStatusTable } from "@/components/curriculum/UnitStatusTable";
import { curriculumCopy } from "@/lib/copy/vi";
import { loadCurriculumCards } from "@/lib/curriculum/load";
import { formatDateVi } from "@/lib/inquiries/format";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** Trạng thái Unit of one curriculum (version in use) + the last changes. The child's tutor or parent. */
export default async function CurriculumUnitsPage({ params }: { params: Promise<{ id: string; curriculumId: string }> }) {
  const { id, curriculumId } = await params;
  const { learner } = await requireLearnerPage(id, "curriculum:read");
  const card = (await loadCurriculumCards(learner.id)).find((c) => c.id === curriculumId);
  if (!card || !card.current || !card.progress) notFound();
  const recent = [...card.events].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 10);
  return (
    <>
      <div className="mx-auto max-w-[1240px]" data-testid="curriculum-units-page">
        <Link href={`/learners/${learner.id}/curricula`} className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {curriculumCopy.navLink}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{curriculumCopy.unitsTitle(card.title)}</h1>
        <p className="mt-2 text-[15px]">
          <span className="text-muted">{curriculumCopy.currentLabel}: </span>
          <b data-testid="units-current">{card.progress.current ? curriculumCopy.currentLine(card.progress.current.code, card.progress.current.title) : curriculumCopy.notStarted}</b>
        </p>
        <div className="mt-2">
          <CoverageBar done={card.progress.done} total={card.progress.total} pct={card.progress.pct} testId="units-coverage" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <UnitStatusTable curriculumId={card.id} units={card.current.units} statusOf={card.progress.statusOf} />
          <aside className="mt-4 h-fit rounded-2xl border border-line bg-white p-4 text-sm lg:sticky lg:top-4">
            <h2 className="font-semibold">{curriculumCopy.historyTitle}</h2>
            {recent.length === 0 ? <p className="text-muted">{curriculumCopy.historyNone}</p> : null}
            <ul className="mt-2 flex flex-col gap-1">
              {recent.map((e) => (
                <li key={e.id}>{curriculumCopy.historyLine(e.unitCode, curriculumCopy.unitStatus[e.status], formatDateVi(e.at.slice(0, 10)))}</li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </>
  );
}
