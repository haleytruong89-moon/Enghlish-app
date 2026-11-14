import Link from "next/link";
import { AiSoftCapBox } from "@/components/settings/AiSoftCapBox";
import { RecentLevelChanges } from "@/components/levels/RecentLevelChanges";
import { deskCopy, home, learnerWithTrack, todayPage } from "@/lib/copy/vi";
import { deskAlerts } from "@/lib/desk/alerts";
import type { DeskData } from "@/lib/desk/load";
import type { LearnerSummary } from "@/lib/home/visible";
import { formatDay } from "@/lib/review/format";
import type { ShellData } from "@/lib/shell/shell";
import { CurriculumBox } from "./CurriculumBox";
import { DeskAlerts } from "./DeskAlerts";
import { DeskInbox } from "./DeskInbox";
import { ProfileBox } from "./ProfileBox";
import { SessionsBox } from "./SessionsBox";

const SECONDARY = "inline-flex min-h-11 items-center rounded-xl border border-line bg-white px-4 text-sm font-semibold text-accent no-underline hover:border-accent";

/** Bàn làm việc of one child (spec §3, §5 rule 2). Presentational: the page loads `data` after the gate. */
export function DeskView({ shell, learner, data, todayIso }: { shell: ShellData; learner: LearnerSummary; data: DeskData; todayIso: string }) {
  const id = learner.id;
  const parent = shell.role === "parent";
  const alerts = deskAlerts({
    learnerId: id, role: shell.role, todayIso, today: data.today, intakeMissing: data.intakeMissing,
    curriculaCount: data.curricula === null ? null : data.curricula.length,
    levelsAssumed: data.profile ? data.profile.domains.some((d) => d.status === "assumed") : null,
    flagCount: data.pending.rows.filter((r) => r.kind === "flag").length,
    roadmapOrphans: data.roadmap ? data.roadmap.orphans : null,
  });
  return (
    <div className="flex flex-col gap-5" data-testid="today-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="desk-title">{deskCopy.title(learner.alias)}</h1>
          <p className="mt-1 text-sm text-muted">{deskCopy.subtitle(learnerWithTrack(learner.alias, learner.trackId), todayPage.title(formatDay(todayIso)))}</p>
          {parent ? <p className="mt-1 text-sm text-muted">{home.parentSummary(shell.learners.length)}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={todayPage.actionsLabel}>
          <Link href={`/learners/${id}/notes/new`} data-testid={`action-note-${id}`} className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 text-sm font-semibold text-white no-underline">{deskCopy.logToday}</Link>
          <Link href={`/learners/${id}/results/new`} data-testid={`action-result-${id}`} className={SECONDARY}>{todayPage.resultAction}</Link>
          <Link href={`/learners/${id}/assign`} data-testid={`action-assign-${id}`} className={SECONDARY}>{todayPage.assignAction}</Link>
        </div>
      </div>
      <DeskInbox learnerId={id} pending={data.pending} />
      <DeskAlerts learnerId={id} items={alerts} />
      {parent && data.roadmap?.recentTitle ? (
        <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm" data-testid="desk-roadmap-line">
          {deskCopy.roadmapLine.parentNew(data.roadmap.recentTitle)}{" "}
          <Link href={`/learners/${id}/roadmap`} className="font-medium text-accent underline">{deskCopy.roadmapLine.open}</Link>
        </p>
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <ProfileBox learnerId={id} alias={learner.alias} profile={data.profile} weak={data.today?.weak.tags ?? []} />
        <CurriculumBox learnerId={id} cards={data.curricula} />
        <SessionsBox learnerId={id} today={data.today} todayIso={todayIso} sessions={data.sessions} />
      </div>
      {parent && data.recent ? <RecentLevelChanges items={data.recent} /> : null}
      {parent && data.aiSettings ? <AiSoftCapBox settings={data.aiSettings} /> : null}
    </div>
  );
}
