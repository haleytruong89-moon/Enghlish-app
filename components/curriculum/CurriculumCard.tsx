import Link from "next/link";
import type { GateReason } from "@/lib/ai/cap";
import { curriculumCopy } from "@/lib/copy/vi";
import type { CurriculumCard as Card } from "@/lib/curriculum/shape";
import { AddCurriculumForm } from "./AddCurriculumForm";
import { CoverageBar } from "./CoverageBar";
import { EditMapButton } from "./EditMapButton";

const pill = "inline-flex items-center rounded-full border border-line px-2.5 py-0.5 text-xs font-medium";
const link = "inline-flex min-h-11 items-center text-sm font-medium text-accent underline";

/** One curriculum on the Giáo trình page: level note, "đang học đến", coverage, then what to do next. Adults only. */
export function CurriculumCard({ card, learnerId, aiAllowed, aiReason }: { card: Card; learnerId: string; aiAllowed: boolean; aiReason: GateReason | null }) {
  const { current, progress, open } = card;
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5" data-testid={`curriculum-${card.id}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{card.title}</h2>
        {current ? <span className={pill}>{curriculumCopy.versionLabel(current.version)} · {curriculumCopy.statusLabels.approved}</span> : null}
      </header>
      {card.levelNote ? (
        <p className="text-sm text-muted">
          {curriculumCopy.levelNote}: {card.levelNote}
        </p>
      ) : null}
      {current && progress ? (
        <>
          <p className="text-[15px]" data-testid={`curriculum-current-${card.id}`}>
            <span className="text-muted">{curriculumCopy.currentLabel}: </span>
            <b>{progress.current ? curriculumCopy.currentLine(progress.current.code, progress.current.title) : curriculumCopy.notStarted}</b>
          </p>
          <CoverageBar done={progress.done} total={progress.total} pct={progress.pct} testId={`curriculum-coverage-${card.id}`} />
        </>
      ) : (
        <p className="text-sm text-muted">{curriculumCopy.notApproved}</p>
      )}
      <div className="flex flex-wrap gap-x-5">
        {open ? (
          <Link href={`/curricula/versions/${open.versionId}`} data-testid={`curriculum-open-${card.id}`} className={link}>
            {curriculumCopy.continueReview} ({curriculumCopy.statusLabels[open.status]})
          </Link>
        ) : null}
        {current ? (
          <>
            <Link href={`/curricula/versions/${current.versionId}`} data-testid={`curriculum-map-${card.id}`} className={link}>
              {curriculumCopy.viewMap}
            </Link>
            <Link href={`/learners/${learnerId}/curricula/${card.id}`} data-testid={`curriculum-units-${card.id}`} className={link}>
              {curriculumCopy.unitsLink}
            </Link>
            {open ? null : <EditMapButton curriculumId={card.id} />}
          </>
        ) : null}
      </div>
      {open ? null : (
        <details className="rounded-xl border border-line p-3">
          <summary className="min-h-11 cursor-pointer text-sm font-semibold text-accent" data-testid={`curriculum-load-${card.id}`}>
            {curriculumCopy.loadToc}
          </summary>
          <div className="mt-3">
            <AddCurriculumForm learnerId={learnerId} curriculumId={card.id} aiAllowed={aiAllowed} aiReason={aiReason} />
          </div>
        </details>
      )}
    </article>
  );
}
