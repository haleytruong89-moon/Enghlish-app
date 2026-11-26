import Link from "next/link";
import { notFound } from "next/navigation";
import { CoverageBar } from "@/components/curriculum/CoverageBar";
import { UnitStatusTable } from "@/components/curriculum/UnitStatusTable";
import { WorkUnitProposal } from "@/components/curriculum/WorkUnitProposal";
import { curriculumCopy } from "@/lib/copy/vi";
import { loadCurriculumCards, loadSentWorkUnits } from "@/lib/curriculum/load";
import { proposeFromSentWork } from "@/lib/curriculum/workProposal";
import { formatDateVi } from "@/lib/inquiries/format";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** Trạng thái Unit of one curriculum (version in use) + the last changes. The child's tutor or parent. */
export default async function CurriculumUnitsPage({ params }: { params: Promise<{ id: string; curriculumId: string }> }) {
  const { id, curriculumId } = await params;
  const { learner } = await requireLearnerPage(id, "curriculum:read");
  const [cards, sent] = await Promise.all([loadCurriculumCards(learner.id), loadSentWorkUnits(learner.id).catch(() => [])]);
  const card = cards.find((c) => c.id === curriculumId);
  if (!card || !card.current || !card.progress) notFound();
  // L2: the app already sets "Đang học" from work sent; what is left "Chưa bắt đầu" with work sent is the adult's choice made AFTER that
  // work — never proposed again until newer work comes in (the adult wins).
  const lastAdult = new Map<string, string>();
  for (const e of card.events) if ((lastAdult.get(e.unitCode) ?? "") < e.at) lastAdult.set(e.unitCode, e.at);
  const proposals = proposeFromSentWork(card.id, sent, card.progress.statusOf, new Set(card.current.units.filter((u) => u.skipped).map((u) => u.code)))
    .filter((p) => !(lastAdult.get(p.code) && (lastAdult.get(p.code) as string) >= p.lastSentAt));
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
        <p className="mt-3 rounded-xl border border-line bg-white px-4 py-3 text-sm text-muted" data-testid="units-auto-rule">{curriculumCopy.autoRule}</p>
        <WorkUnitProposal curriculumId={card.id} proposals={proposals} />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <UnitStatusTable curriculumId={card.id} units={card.current.units} statusOf={card.progress.statusOf} autoOf={card.progress.autoOf} />
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
