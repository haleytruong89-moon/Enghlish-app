import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { AddCurriculumForm } from "@/components/curriculum/AddCurriculumForm";
import { CurriculumCard } from "@/components/curriculum/CurriculumCard";
import { curriculumCopy, learnerWithTrack } from "@/lib/copy/vi";
import { loadCurriculumCards } from "@/lib/curriculum/load";
import { loadStudioGate } from "@/lib/studio/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** Giáo trình của một em (spec §3): one card per book + "Thêm giáo trình". The child's tutor or parent; others 404. */
export default async function CurriculaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { member, learner } = await requireLearnerPage(id, "curriculum:read");
  const [cards, gate] = await Promise.all([loadCurriculumCards(learner.id), loadStudioGate(learner.id)]);
  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} feedbackScreen={curriculumCopy.screenLabel} />
      <main className="mx-auto max-w-[1240px] px-4 py-8" data-testid="curricula-page">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {curriculumCopy.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{curriculumCopy.title(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        <p className="mt-3 max-w-3xl text-[15px]">{curriculumCopy.intro}</p>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {cards.length === 0 ? <p className="text-muted">{curriculumCopy.empty}</p> : null}
          {cards.map((c) => (
            <CurriculumCard key={c.id} card={c} learnerId={learner.id} aiAllowed={gate.allowed} aiReason={gate.reason} />
          ))}
        </div>
        <section className="mt-8 max-w-3xl rounded-2xl border border-line bg-white p-5" data-testid="add-curriculum-box">
          <h2 className="text-lg font-semibold">{curriculumCopy.addTitle}</h2>
          <p className="mb-4 mt-1 text-xs text-muted">{curriculumCopy.oneChildNote}</p>
          <AddCurriculumForm learnerId={learner.id} aiAllowed={gate.allowed} aiReason={gate.reason} />
        </section>
      </main>
    </>
  );
}
