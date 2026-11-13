// app/studio/new/page.tsx
import { deskHref } from "@/lib/shell/paths";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StaffShell } from "@/components/shell/StaffShell";
import { requireShell } from "@/lib/shell/load";
import { DraftList } from "@/components/studio/DraftList";
import { UploadForm } from "@/components/studio/UploadForm";
import { learnerWithTrack, reviewPage, studioCopy } from "@/lib/copy/vi";
import { authorizeLearnerPage } from "@/lib/review/access";
import { loadDraftList, loadStudioGate } from "@/lib/studio/load";
import { readPrefill } from "@/lib/prefill";
import { getAuthUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Tạo bài từ đề (spec §3 step 1): the child's tutor or parent. ?learner=<id>. Students / outsiders: 404. */
export default async function StudioNewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const learner = typeof sp.learner === "string" ? sp.learner : undefined;
  const prefill = readPrefill(sp);
  const user = await getAuthUser();
  // The gate and the shell read in parallel (both use the per-request cached user and member).
  const [access, shell] = await Promise.all([authorizeLearnerPage(user, learner ?? "", "studio:write"), requireShell(learner ?? null)]);
  if (access.kind === "login") redirect("/login");
  if (access.kind === "not-found") notFound();
  const l = access.grant.learner;
  const [gate, drafts] = await Promise.all([loadStudioGate(l.id), loadDraftList(l.id)]);
  return (
    <StaffShell shell={shell}>
      <div className="mx-auto max-w-2xl" data-testid="studio-new">
        <Link href={deskHref(l.id)} className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {reviewPage.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{studioCopy.newTitle}</h1>
        <p className="mt-1 text-muted">
          {studioCopy.learnerLabel} {learnerWithTrack(l.alias, l.trackId)}
        </p>
        <p className="mt-3 text-[15px]">{studioCopy.newIntro}</p>
        <UploadForm learnerId={l.id} aiAllowed={gate.allowed} aiReason={gate.reason} prefill={prefill} />
        <DraftList drafts={drafts} />
      </div>
    </StaffShell>
  );
}
