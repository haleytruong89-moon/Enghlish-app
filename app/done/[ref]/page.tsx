import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PracticeCard } from "@/components/student/desk/PracticeCard";
import { StudentDeskShell } from "@/components/student/desk/StudentDeskShell";
import { studentDeskCopy as c } from "@/lib/copy/vi";
import { loadDeskBase, loadPracticeItem } from "@/lib/student/desk";

export const dynamic = "force-dynamic";

/** One link / PDF bài the child sent (W4b): the same card as before — open it, see "Đã gửi", send again until it has been looked at. */
export default async function DoneItemPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const [base, item] = await Promise.all([loadDeskBase(), loadPracticeItem(ref)]);
  if (base.kind === "login") redirect("/login");
  if (base.kind !== "ok" || !item) notFound();
  return (
    <StudentDeskShell active="done" learnerId={base.learnerId} seenTimes={(base.seenFirst ?? []).map((r) => r.newsAt)} showTestBadge={base.isTest} tutorReady={base.tutorReady}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4" data-testid="done-item-page">
        <Link href="/done" className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline">{c.back}</Link>
        <PracticeCard item={item} />
      </div>
    </StudentDeskShell>
  );
}
