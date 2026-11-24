import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StudentDeskShell } from "@/components/student/desk/StudentDeskShell";
import { VocabCard } from "@/components/student/tutor/VocabCard";
import { notebookCopy } from "@/lib/copy/vi";
import { loadDeskBase } from "@/lib/student/desk";
import { loadCardView } from "@/lib/student/notebook";

export const dynamic = "force-dynamic";

/** One word card opened again from "Từ vừa tra" or Sổ tay (E2a): no lookup counted, no AI. `?from=notebook` sets the back link. */
export default async function CardPage({ params, searchParams }: { params: Promise<{ cardId: string }>; searchParams: Promise<{ from?: string }> }) {
  const [{ cardId }, sp] = await Promise.all([params, searchParams]);
  const [base, card] = await Promise.all([loadDeskBase(), loadCardView(cardId)]);
  if (base.kind === "login") redirect("/login");
  if (base.kind !== "ok" || !card) notFound();
  const fromNotebook = sp.from === "notebook";
  return (
    <StudentDeskShell active={fromNotebook ? "notebook" : "tutor"} learnerId={base.learnerId} seenTimes={(base.seenFirst ?? []).map((r) => r.newsAt)} showTestBadge={base.isTest} tutorReady={base.tutorReady}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4" data-testid="card-page">
        <Link href={fromNotebook ? "/notebook" : "/tutor"} className="self-start">{fromNotebook ? notebookCopy.back : notebookCopy.backTutor}</Link>
        <VocabCard card={card} askId={null} saved={fromNotebook} />
      </div>
    </StudentDeskShell>
  );
}
