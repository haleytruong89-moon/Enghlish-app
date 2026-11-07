// app/studio/new/page.tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { DraftList } from "@/components/studio/DraftList";
import { UploadForm } from "@/components/studio/UploadForm";
import { learnerWithTrack, reviewPage, studioCopy } from "@/lib/copy/vi";
import { authorizeLearnerPage } from "@/lib/review/access";
import { loadDraftList, loadStudioGate } from "@/lib/studio/load";
import { createUserClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Tạo bài từ đề (spec §3 step 1): the child's tutor or parent. ?learner=<id>. Students / outsiders: 404. */
export default async function StudioNewPage({ searchParams }: { searchParams: Promise<{ learner?: string }> }) {
  const { learner } = await searchParams;
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const access = await authorizeLearnerPage(user, learner ?? "", "studio:write");
  if (access.kind === "login") redirect("/login");
  if (access.kind === "not-found") notFound();
  const l = access.grant.learner;
  const [gate, drafts] = await Promise.all([loadStudioGate(l.id), loadDraftList(l.id)]);
  return (
    <>
      <AppHeader name={access.grant.member.displayName} showTestBadge={l.isTest} />
      <main className="mx-auto max-w-2xl px-4 py-10" data-testid="studio-new">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {reviewPage.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{studioCopy.newTitle}</h1>
        <p className="mt-1 text-muted">
          {studioCopy.learnerLabel} {learnerWithTrack(l.alias, l.trackId)}
        </p>
        <p className="mt-3 text-[15px]">{studioCopy.newIntro}</p>
        <UploadForm learnerId={l.id} aiAllowed={gate.allowed} aiReason={gate.reason} />
        <DraftList drafts={drafts} />
      </main>
    </>
  );
}
