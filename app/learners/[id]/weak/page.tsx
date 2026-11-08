import { deskHref } from "@/lib/shell/paths";
import Link from "next/link";
import { DomainTiles } from "@/components/tutor/DomainTiles";
import { ReadingSkillsTable } from "@/components/tutor/ReadingSkillsTable";
import { WeakTable } from "@/components/tutor/WeakTable";
import { learnerWithTrack, resultPage, weakPage } from "@/lib/copy/vi";
import { logAppError } from "@/lib/ops/logAppError";
import { loadReadingSkills } from "@/lib/reading/load";
import { loadSoft } from "@/lib/reading/soft";
import { groupWeakPoints } from "@/lib/skillmap/group";
import { loadSkillMap } from "@/lib/skillmap/load";
import { loadUntagged, loadWeakPoints } from "@/lib/tutorwork/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";
import { WEAK_WINDOWS, type WeakWindow } from "@/lib/tutorwork/schemas";

export const dynamic = "force-dynamic";

/**
 * "Điểm cần chú ý" of one child (parent and tutor only): first 7 domain tiles of the skill map (SM-1), then — for ?domain= — the
 * tag × source table of that domain (the "Kỹ năng đọc" table lives in the Đọc domain), over 4 weeks / 8 weeks / all time.
 */
export default async function WeakPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ weeks?: string; domain?: string }> }) {
  const { id } = await params;
  const { weeks, domain } = await searchParams;
  const { member, learner } = await requireLearnerPage(id, "tutorwork:read");
  const window: WeakWindow = (WEAK_WINDOWS as readonly string[]).includes(weeks ?? "") ? (weeks as WeakWindow) : "8";
  const role = member.role === "tutor" ? "tutor" : "parent";
  const [view, pending, map] = await Promise.all([
    loadWeakPoints(learner.id, window),
    loadUntagged(learner.id, { role, memberId: member.id }),
    loadSkillMap(learner.id),
  ]);
  const tiles = groupWeakPoints(map, view.tags);
  const tile = tiles.find((t) => t.key === domain) ?? null;
  const pick = domain === "all" ? "all" : (tile?.key ?? null);
  // Fail soft: the reading table is an add-on of the Đọc tile; if it cannot be read the rest of the page still renders.
  // Always loaded: the Đọc tile counts the reading skills that need attention even while another tile is open.
  const reading = await loadSoft(
    () => loadReadingSkills(learner.id),
    (error) => logAppError({ route: "GET /learners/[id]/weak (reading skills)", code: "reading_skills", error, userId: member.userId }),
  );
  const readingWeak = reading?.skills.filter((s) => s.status === "weak").length ?? 0;

  return (
    <>
      <div className="mx-auto max-w-5xl" data-testid="weak-page">
        <Link href={deskHref(learner.id)} className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {weakPage.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{weakPage.title(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        <p className="mt-3 text-muted">{weakPage.intro}</p>

        <nav aria-label={weakPage.windowLabel} className="mt-5 flex flex-wrap gap-2">
          {WEAK_WINDOWS.map((w) => (
            <Link
              key={w}
              href={`/learners/${learner.id}/weak?weeks=${w}${pick ? `&domain=${pick}` : ""}`}
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

        <DomainTiles tiles={tiles} learnerId={learner.id} weeks={window} active={pick} readingWeak={readingWeak} />

        {pick === null ? (
          <p className="mt-4 text-sm text-muted" data-testid="weak-tiles-hint">
            {weakPage.tilesHint}
          </p>
        ) : (
          <section className="mt-6" data-testid={`weak-detail-${pick}`}>
            <h2 className="text-xl font-semibold">{tile ? tile.name : weakPage.allTitle}</h2>
            <div className="mt-3">
              <WeakTable view={tile ? { ...view, tags: tile.points } : view} />
            </div>
            {pick === "reading" ? <ReadingSkillsTable view={reading} learnerId={learner.id} /> : null}
          </section>
        )}
      </div>
    </>
  );
}
