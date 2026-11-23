import Link from "next/link";
import { notFound } from "next/navigation";
import { VocabCard } from "@/components/student/tutor/VocabCard";
import { tutorAsksCopy as c } from "@/lib/copy/vi";
import { loadCardView } from "@/lib/student/notebook";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** The card the child saw, for the parent / tutor (read-only: no save, no "Chưa hiểu", no 😊). */
export default async function TutorAskCardPage({ params }: { params: Promise<{ id: string; cardId: string }> }) {
  const { id, cardId } = await params;
  const { learner } = await requireLearnerPage(id, "tutorwork:read");
  const card = await loadCardView(cardId);
  if (!card) notFound();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3" data-testid="tutor-ask-card-page">
      <Link href={`/learners/${learner.id}/tutor-asks`} className="inline-flex min-h-11 items-center self-start text-sm text-accent underline">{c.backList}</Link>
      <VocabCard card={card} askId={null} readOnly />
    </div>
  );
}
