// app/studio/drafts/[id]/page.tsx
import { GuardedLink as Link } from "@/components/ui/GuardedLink";
import { notFound, redirect } from "next/navigation";
import { StaffShell } from "@/components/shell/StaffShell";
import { withShell } from "@/lib/shell/parallel";
import { AssignStudioForm } from "@/components/studio/AssignStudioForm";
import { DraftEditor } from "@/components/studio/DraftEditor";
import { EditApprovedButton } from "@/components/studio/EditApprovedButton";
import { ExtractWaiting } from "@/components/studio/ExtractWaiting";
import { SidePanel } from "@/components/studio/SidePanel";
import { studioCopy } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import { formatDay } from "@/lib/review/format";
import { loadDraftPage } from "@/lib/studio/load";
import { loadUnitChoices } from "@/lib/curriculum/load";
import { aiFailedText } from "@/lib/studio/view";
import { loadStudioAssigned } from "@/lib/studio/assignedLoad";
import { loadAssignments } from "@/lib/practice/load";
import { isDuplicate, openTitles } from "@/lib/assigned/duplicates";

export const dynamic = "force-dynamic";

/** Duyệt đề (board 19) and, once approved, Giao bài. The child's tutor or parent; others 404. */
export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: r, shell } = await withShell(loadDraftPage(id), (x) => (x.kind === "ok" ? x.data.draft.learnerId : null));
  if (r.kind === "login") redirect("/login");
  if (r.kind === "not-found" || !shell) notFound();
  const { draft, summary, gate } = r.data;
  // Units to give with the test (0037). Only once approved; a failed lookup = no Units offered (the test is still given as before).
  const approved = draft.status === "approved";
  const [unitChoices, studio, practice] = approved
    ? await Promise.all([
        loadUnitChoices(draft.learnerId).catch(() => []),
        // Only for the "same title" warning (24/11): a failed read = no warning.
        loadStudioAssigned(draft.learnerId, todayVn()).catch(() => null),
        loadAssignments(draft.learnerId).catch(() => []),
      ])
    : [[], null, []];
  const duplicate = approved && isDuplicate(draft.title, openTitles(studio, practice));
  return (
    <StaffShell shell={shell}>
      <div className="mx-auto max-w-6xl" data-testid="studio-draft" data-status={draft.status}>
        <Link href={`/studio/new?learner=${draft.learnerId}`} className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {studioCopy.newTitle}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{draft.status === "approved" ? draft.title : studioCopy.reviewTitle}</h1>
        {draft.status === "extracting" ? <ExtractWaiting draftId={draft.id} /> : null}
        {draft.status === "ai_failed" ? (
          <section role="alert" data-testid="ai-failed" className="mt-4 rounded-2xl border border-[#E9C46A] bg-[#FBF1DC] p-4 text-[#6B4600]">
            <p className="font-semibold">{studioCopy.aiFailedTitle}</p>
            <p className="text-sm">{aiFailedText(draft.errorCode)} {studioCopy.aiFailedNext}</p>
          </section>
        ) : null}
        {draft.status === "draft" || draft.status === "ai_failed" ? <DraftEditor initial={r.data} /> : null}
        {draft.status === "approved" ? (
          <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_20rem]">
            <section data-testid="approved-box" className="rounded-2xl border border-line bg-white p-5">
              <p className="font-semibold text-accent">{studioCopy.approvedTitle}</p>
              <p className="text-sm text-muted">{studioCopy.approvedNote}</p>
              <ul className="mt-3 text-sm" data-testid="assigned-list">
                {draft.assigned.map((a) => (
                  <li key={a.instanceId}>{studioCopy.assignedLine(formatDay(a.startOn ?? a.dueOn), formatDay(a.dueOn))}</li>
                ))}
              </ul>
              <AssignStudioForm draftId={draft.id} today={todayVn()} learnerId={draft.learnerId} unitChoices={unitChoices} duplicate={duplicate} />
              {draft.supersededBy ? null : <EditApprovedButton draftId={draft.id} />}
            </section>
            <SidePanel summary={summary} aiCostUsd={draft.aiCostUsd} gate={gate} />
          </div>
        ) : null}
        {draft.status === "discarded" ? <p className="mt-4 text-muted">{studioCopy.statusLabels.discarded}</p> : null}
      </div>
    </StaffShell>
  );
}
