import Link from "next/link";
import { CoverageBar } from "@/components/curriculum/CoverageBar";
import { deskCopy, shellCopy } from "@/lib/copy/vi";
import type { CurriculumCard } from "@/lib/curriculum/shape";
import { BOX, BOX_LINK } from "./ProfileBox";

/** Stands in the "Lộ trình" slot of the prototype until W5 (plan K7). */
export function CurriculumBox({ learnerId, cards }: { learnerId: string; cards: CurriculumCard[] | null }) {
  return (
    <section data-testid="desk-curricula" className={BOX}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{shellCopy.sections.curricula}</h2>
        <Link href={`/learners/${learnerId}/curricula`} className={BOX_LINK}>{deskCopy.seeAll}</Link>
      </div>
      {cards === null ? <p className="text-sm text-muted">{deskCopy.curriculaUnavailable}</p> : null}
      {cards !== null && cards.length === 0 ? <p className="text-sm text-muted">{deskCopy.curriculaEmpty}</p> : null}
      {(cards ?? []).map((c) => (
        <div key={c.id} className="flex flex-col gap-1 border-t border-[#eceee8] pt-2 first:border-t-0 first:pt-0">
          <p className="text-sm font-semibold">{c.title}</p>
          <p className="text-sm text-muted">{c.progress?.current ? deskCopy.currentUnit(c.progress.current.code, c.progress.current.title) : deskCopy.noCurrentUnit}</p>
          {c.progress ? <CoverageBar done={c.progress.done} total={c.progress.total} pct={c.progress.pct} testId={`desk-coverage-${c.id}`} /> : null}
          {c.open && (c.open.status === "draft" || c.open.status === "ai_failed") ? (
            <span className="self-start rounded-full bg-[#e4ebf5] px-2.5 py-0.5 text-xs font-semibold text-[#1f3f6e]">{deskCopy.draftWaiting}</span>
          ) : null}
        </div>
      ))}
    </section>
  );
}
