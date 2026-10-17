import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { ScoringPanel, type PanelTarget } from "@/components/review/ScoringPanel";
import { SupportForm } from "@/components/review/SupportForm";
import { WorkPanel } from "@/components/review/WorkPanel";
import { WritingTags } from "@/components/tutor/WritingTags";
import { activityLabels, app, fallbackLabels, inquiriesPage, learnerWithTrack, modeLabels, provenanceLabels, purposeLabels, reviewPage, type Mode } from "@/lib/copy/vi";
import { authorizeLearnerPage } from "@/lib/review/access";
import { formatWhen, skillLabel } from "@/lib/review/format";
import { findEpisodeLearner, loadEpisode } from "@/lib/review/load";
import { createUserClient } from "@/lib/supabase/server";
import { loadTags, loadWritingTagKeys } from "@/lib/tutorwork/load";
import { TAGGABLE_ACTIVITIES } from "@/lib/tutorwork/types";

export const dynamic = "force-dynamic";

/**
 * Review one piece of work — parent and tutor only; students and outsiders get a plain 404. The work is shown beside the
 * rubric of each skill of the step. Who may DECIDE (D15) is decided by the database; the page only mirrors it.
 */
export default async function ReviewEpisodePage({ params }: { params: Promise<{ episodeId: string }> }) {
  const { episodeId } = await params;
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const learnerId = await findEpisodeLearner(episodeId);
  if (!learnerId) notFound();
  const access = await authorizeLearnerPage(user, learnerId, "work:review");
  if (access.kind === "login") redirect("/login");
  if (access.kind === "not-found") notFound();

  const view = await loadEpisode(episodeId);
  if (!view) notFound();

  const { member, learner } = access.grant;
  const targets: PanelTarget[] = view.targets.map((t) => ({ ...t, label: skillLabel(t.key, t.titleVi) }));
  const scorable = targets.filter((t) => t.scorable);
  const mode = view.attempt.mode as Mode;
  const checkpoint = view.episode.facets.checkpoint === true;
  // Tag chips for written work (tutor or parent). A failed lookup leaves the chips out; it never blocks the review itself.
  const taggable = (TAGGABLE_ACTIVITIES as readonly string[]).includes(view.activity.activityType);
  const writing = taggable
    ? await Promise.all([loadTags(learner.trackId), loadWritingTagKeys(learner.id, view.episode.id)]).catch(() => null)
    : null;

  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} />
      <main className="mx-auto max-w-5xl px-4 py-10" data-testid="review-page">
        <Link href="/review" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {reviewPage.backToInbox}
        </Link>

        <header className="mt-2 flex flex-col gap-2">
          <p className="text-sm text-muted">
            {learnerWithTrack(learner.alias, learner.trackId)} · {inquiriesPage.stepLabel(view.activity.stepNo)} ·{" "}
            {activityLabels[view.activity.activityType] ?? fallbackLabels.activity}
          </p>
          <h1 className="text-2xl font-bold">
            {view.inquiry.titleVi}
            {view.inquiry.bigQuestionEn ? (
              <span lang="en" className="font-medium text-muted">
                {" "}
                · {view.inquiry.bigQuestionEn}
              </span>
            ) : null}
          </h1>
          <ul className="flex flex-wrap gap-2 text-sm">
            {[
              modeLabels[mode]?.staff ?? fallbackLabels.mode,
              reviewPage.attemptNo(view.attempt.attemptNo),
              provenanceLabels[view.attempt.provenance] ?? fallbackLabels.provenance,
              reviewPage.submittedAt(formatWhen(view.attempt.submittedAt)),
              ...view.activity.purpose.map((p) => purposeLabels[p] ?? fallbackLabels.purpose),
              ...(view.episode.observedDirectly && !checkpoint ? [reviewPage.liveTag] : []),
              ...(view.episode.isFirstAttempt ? [reviewPage.firstAttemptTag] : []),
              ...(checkpoint ? [reviewPage.blindNote] : []),
            ].map((chip) => (
              <li key={chip} className="rounded-full bg-[#E3ECE8] px-3 py-1 text-[#1F4439]">
                {chip}
              </li>
            ))}
          </ul>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <WorkPanel view={view} />
            {writing ? <WritingTags learnerId={learner.id} episodeId={view.episode.id} tags={writing[0]} saved={writing[1]} /> : null}
            {scorable.length > 0 && view.viewer.canDecide ? <SupportForm attemptId={view.attempt.id} skills={scorable.map((t) => ({ key: t.key, label: t.label }))} /> : null}
          </div>
          <ScoringPanel
            episodeId={view.episode.id}
            alias={learner.alias}
            viewerRole={view.viewer.role}
            canDecide={view.viewer.canDecide}
            observedDirectly={view.episode.observedDirectly}
            targets={targets}
          />
        </div>

        <details className="mt-8 text-xs text-muted">
          <summary className="min-h-11 cursor-pointer py-3">{app.techInfo}</summary>
          <p>
            {reviewPage.techInfoVersions}: {view.tech.templateId}@{view.tech.templateVersion} · {view.tech.catalogueVersion ?? "-"} ·{" "}
            {view.tech.descriptorVersion ?? "-"} · {view.tech.policyVersion ?? "-"}
          </p>
          <p>
            {reviewPage.techInfoCodes}: {view.activity.activityType} · {view.targets.map((t) => t.key).join(", ")}
          </p>
        </details>
      </main>
    </>
  );
}
