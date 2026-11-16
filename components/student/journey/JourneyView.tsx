import { journeyCopy } from "@/lib/copy/vi";
import type { Journey } from "@/lib/journey/path";
import { AchievementsCard } from "@/components/student/goal/AchievementsCard";
import { WeekCard } from "@/components/student/goal/WeekCard";
import type { CandoItem } from "@/lib/student/cando";
import type { LevelsView } from "@/lib/student/levels";
import type { ThenNowView } from "@/lib/student/thenNow";
import { CandoCard } from "./CandoCard";
import { LevelsCard } from "./LevelsCard";
import { ThenNowCard } from "./ThenNowCard";
import type { ShownAchievements, WeekView } from "@/lib/student/weekView";
import { JourneySummary } from "./JourneySummary";
import { Mountain } from "./Mountain";
import { OtherCurricula } from "./OtherCurricula";
import { PathList } from "./PathList";

/** The student's Hành trình page body (W4a: the mountain, the list, the summary, other curricula; W4d: the week; W4e: level names, can-do cards, then-now). Counts of the child's own work only; no score anywhere. */
export function JourneyView({
  journey, week = null, achievements = null, levels = null, cando = null, thenNow = null,
}: {
  journey: Journey;
  /** W4d: this week, the goal and the soft streak (null = not available yet). */
  week?: WeekView | null;
  achievements?: ShownAchievements | null;
  /** W4e: the level names the tutor confirmed, the "điều đã làm được" cards and the picked pair (null = not available / nothing yet). */
  levels?: LevelsView | null;
  cando?: readonly CandoItem[] | null;
  thenNow?: ThenNowView | null;
}) {
  return (
    <div className="mx-auto max-w-5xl" data-testid="journey-page">
      <h1 className="text-3xl font-bold">{journeyCopy.title}</h1>
      <p className="mt-1 text-muted">{journeyCopy.intro}</p>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-line bg-white p-5" aria-labelledby="journey-mountain">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="journey-mountain" className="text-lg font-semibold">{journeyCopy.mountainTitle}</h2>
              <p className="text-sm text-muted">{journeyCopy.mountainLabel(journey.mainTitle)}</p>
            </div>
            <span className="rounded-full bg-[#e3ece8] px-3 py-1 text-sm font-semibold text-accent" data-testid="journey-summit-tag">
              ▲ {journey.summit ? journey.summit.title : journeyCopy.summit}
            </span>
          </div>
          <div className="mt-3">
            <Mountain journey={journey} />
          </div>
          <JourneySummary summary={journey.summary} />
          {journey.nodes.length > 0 ? (
            <details className="mt-3" data-testid="journey-list-toggle">
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-accent underline">{journeyCopy.asList}</summary>
              <div className="mt-2">
                <PathList journey={journey} />
              </div>
            </details>
          ) : null}
          {!journey.summit ? <p className="mt-3 text-sm text-muted" data-testid="journey-summit-unnamed">{journeyCopy.summitUnnamed}</p> : null}
        </section>
        <div className="flex flex-col gap-5">
          {week ? <WeekCard view={week} /> : null}
          {levels ? <LevelsCard view={levels} /> : null}
          <OtherCurricula journey={journey} />
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-5">
        {cando ? <CandoCard items={cando} /> : null}
        {achievements ? <AchievementsCard shown={achievements} /> : null}
        {thenNow ? <ThenNowCard view={thenNow} /> : null}
      </div>
      <p className="mt-6 text-sm text-muted">{journeyCopy.footnote}</p>
    </div>
  );
}
