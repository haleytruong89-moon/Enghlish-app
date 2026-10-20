import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { ReadingSkillsTable } from "@/components/tutor/ReadingSkillsTable";
import { WeakTable } from "@/components/tutor/WeakTable";
import { learnerWithTrack, resultPage, weakPage } from "@/lib/copy/vi";
import { loadReadingSkills } from "@/lib/reading/load";
import { loadUntagged, loadWeakPoints } from "@/lib/tutorwork/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";
import { WEAK_WINDOWS, type WeakWindow } from "@/lib/tutorwork/schemas";

export const dynamic = "force-dynamic";

/** "Điểm cần chú ý" of one child: tag × source over 4 weeks / 8 weeks / all time. Parent and tutor only. */
export default async function WeakPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ weeks?: string }> }) {
  const { id } = await params;
  const { weeks } = await searchParams;
  const { member, learner } = await requireLearnerPage(id, "tutorwork:read");
  const window: WeakWindow = (WEAK_WINDOWS as readonly string[]).includes(weeks ?? "") ? (weeks as WeakWindow) : "8";
  const role = member.role === "tutor" ? "tutor" : "parent";
  const [view, pending, reading] = await Promise.all([
    loadWeakPoints(learner.id, window),
    loadUntagged(learner.id, { role, memberId: member.id }),
    loadReadingSkills(learner.id),
  ]);

  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} />
      <main className="mx-auto max-w-5xl px-4 py-10" data-testid="weak-page">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {weakPage.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{weakPage.title(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        <p className="mt-3 text-muted">{weakPage.intro}</p>

        <nav aria-label={weakPage.windowLabel} className="mt-5 flex flex-wrap gap-2">
          {WEAK_WINDOWS.map((w) => (
            <Link
              key={w}
              href={`/learners/${learner.id}/weak?weeks=${w}`}
              aria-current={w === window ? "page" : undefined}
              data-testid={`weak-window-${w}`}
              className={`inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium ${w === window ? "border-accent bg-accent text-white" : "border-line bg-white text-ink hover:border-accent"}`}
            >
              {weakPage.windows[w]}
            </Link>
          ))}
        </nav>

        {pending.length > 0 ? (
          <p className="mt-4 rounded-xl border border-line bg-white px-4 py-3 text-sm" data-testid="weak-pending">
            <Link href={`/learners/${learner.id}/results/new#pending`} className="font-medium text-accent underline">
              {weakPage.pendingLink}
            </Link>{" "}
            · {resultPage.pendingTitle}: {pending.length}
          </p>
        ) : null}

        <div className="mt-5">
          <WeakTable view={view} />
        </div>

        <ReadingSkillsTable view={reading} learnerId={learner.id} />
      </main>
    </>
  );
}
