// app/studio/new/page.tsx
import { deskHref } from "@/lib/shell/paths";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StaffShell } from "@/components/shell/StaffShell";
import { requireShell } from "@/lib/shell/load";
import { WaysStrip } from "@/components/assign/WaysStrip";
import { DiscardedDrafts } from "@/components/studio/DiscardedDrafts";
import { DraftList } from "@/components/studio/DraftList";
import { ImportForm } from "@/components/studio/ImportForm";
import { UploadForm } from "@/components/studio/UploadForm";
import { StudioSteps } from "@/components/studio/StudioSteps";
import { GuidedTour } from "@/components/tour/GuidedTour";
import { AI_TOUR_SEEN_KEY, aiTourSteps } from "@/lib/tour/aiSteps";
import { TOUR_SEEN_KEY } from "@/lib/tour/steps";
import { aiGuideCopy, assignWaysCopy, learnerWithTrack, reviewPage, studioCopy } from "@/lib/copy/vi";
import { authorizeLearnerPage } from "@/lib/review/access";
import { loadUnitChoices } from "@/lib/curriculum/load";
import { loadDiscardedDrafts, loadDraftList, loadStudioGate } from "@/lib/studio/load";
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
  const [gate, drafts, unitChoices, discarded] = await Promise.all([loadStudioGate(l.id), loadDraftList(l.id), loadUnitChoices(l.id), loadDiscardedDrafts(l.id).catch(() => [])]);
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
        <WaysStrip learnerId={l.id} current="studio" prefill={prefill} />
        {/* 27/11: the three steps + "Cách dùng AI" (opens by itself once for a tutor on this device). */}
        <StudioSteps stage="upload" learnerId={l.id}
          aside={<GuidedTour steps={aiTourSteps(gate.allowed)} seenKey={AI_TOUR_SEEN_KEY} afterSeen={TOUR_SEEN_KEY} autoStart={shell.role === "tutor"} openText={aiGuideCopy.open} openLabel={aiGuideCopy.openLabel} openTestId="ai-tour-open" />} />
        <p className="mt-3 text-[15px]">{studioCopy.newIntro}</p>
        <UploadForm learnerId={l.id} aiAllowed={gate.allowed} aiReason={gate.reason} prefill={prefill} unitChoices={unitChoices} />
        <ImportForm learnerId={l.id} />
        <div id="drafts">
          <DraftList drafts={drafts} />
          <DiscardedDrafts drafts={discarded} />
          <p className="mt-8">
            <Link href={`/learners/${l.id}/assigned`} data-testid="studio-follow" className="inline-flex min-h-11 items-center text-accent underline">
              {assignWaysCopy.followLink}
            </Link>
          </p>
        </div>
      </div>
    </StaffShell>
  );
}
