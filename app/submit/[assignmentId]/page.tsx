import { notFound, redirect } from "next/navigation";
import { LinkSubmit } from "@/components/student/submit/LinkSubmit";
import { PaperSubmit } from "@/components/student/submit/PaperSubmit";
import { StudentDeskShell } from "@/components/student/desk/StudentDeskShell";
import { maxPagesPerSubmission } from "@/lib/practice/capabilities";
import { loadDeskBase, loadPracticeItem } from "@/lib/student/desk";

export const dynamic = "force-dynamic";

/**
 * The child's screen to send one link / PDF assignment (W4c1): a PDF is "Nộp bài giấy" (take the pages of the paper work), a link is "Nộp bài link"
 * (open it, then send the result pictures). Opened from Hôm nay. Staff and anyone else get a plain 404; the database function checks it is the child's own.
 */
export default async function SubmitPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const [base, item, maxPages] = await Promise.all([loadDeskBase(), loadPracticeItem(assignmentId), maxPagesPerSubmission()]);
  if (base.kind === "login") redirect("/login");
  if (base.kind !== "ok" || !item) notFound();
  return (
    <StudentDeskShell active="today" learnerId={base.learnerId} seenTimes={(base.seenFirst ?? []).map((r) => r.newsAt)} showTestBadge={base.isTest} tutorReady={base.tutorReady}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4" data-testid="submit-page" data-kind={item.kind}>
        {item.kind === "pdf" ? <PaperSubmit key={item.assignmentId} item={item} maxPages={maxPages} /> : <LinkSubmit key={item.assignmentId} item={item} maxPages={maxPages} />}
      </div>
    </StudentDeskShell>
  );
}
