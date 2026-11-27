import Link from "next/link";
import { AiSoftCapBox } from "@/components/settings/AiSoftCapBox";
import { RecentLevelChanges } from "@/components/levels/RecentLevelChanges";
import { deskCopy, home, learnerWithTrack } from "@/lib/copy/vi";
import { deskAlerts } from "@/lib/desk/alerts";
import type { DeskData } from "@/lib/desk/load";
import type { LearnerSummary } from "@/lib/home/visible";
import { roadmapHref } from "@/lib/shell/paths";
import { formatDay } from "@/lib/review/format";
import type { ShellData } from "@/lib/shell/shell";
import { CurriculumBox } from "./CurriculumBox";
import { DeskAlerts } from "./DeskAlerts";
import { DeskInbox } from "./DeskInbox";
import { BadgeSeed } from "@/components/shell/BadgeSeed";
import { pendingView } from "@/lib/desk/pending";
import { GoalBox } from "./GoalBox";
import { ActionCards } from "@/components/results/ActionCards";
import { HandledList } from "@/components/results/HandledList";
import { ProfileBox } from "./ProfileBox";
import { SessionsBox } from "./SessionsBox";
import { StartChecklist } from "@/components/tour/StartChecklist";
import { startCardVisible, startChecklist } from "@/lib/tour/checklist";

/** Hôm nay (was "Bàn làm việc") of one child; the daily actions are the quick buttons of the left column (hướng B) (spec §3, §5 rule 2). Presentational: the page loads `data` after the gate. */
export function DeskView({ shell, learner, data, todayIso }: { shell: ShellData; learner: LearnerSummary; data: DeskData; todayIso: string }) {
  const id = learner.id;
  const parent = shell.role === "parent";
  const alerts = deskAlerts({
    learnerId: id, role: shell.role, todayIso, today: data.today, intakeMissing: data.intakeMissing,
    curriculaCount: data.curricula === null ? null : data.curricula.length,
    levelsAssumed: data.profile ? data.profile.domains.some((d) => d.status === "assumed") : null,
    flagCount: data.pending.rows.filter((r) => r.kind === "flag").length,
    roadmapOrphans: data.roadmap ? data.roadmap.orphans : null,
    studioOverdue: data.studioOverdue ?? null,
    studioOverdueFacts: data.studioOverdueFacts ?? null,
  });
  const start = startChecklist(id, { profile: data.profile, curricula: data.curricula, assigned: data.assigned, practiceGiven: data.today ? data.today.practice.length : null, sessions: data.sessions });
  return (
    <div className="flex flex-col gap-5" data-testid="today-page">
      {/* Hands the numbers this page already has to the left column (Chấm bài = Cần chấm of Bài tập; same buildBoard). */}
      <BadgeSeed learnerId={id} count={pendingView(data.pending).count} work={data.assigned ? String(data.assigned.need) : null} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="desk-title">{deskCopy.title(learner.alias)}</h1>
          <p className="mt-1 text-sm text-muted">{deskCopy.subtitle(learnerWithTrack(learner.alias, learner.trackId), formatDay(todayIso))}</p>
          {parent ? <p className="mt-1 text-sm text-muted">{home.parentSummary(shell.learners.length)}</p> : null}
        </div>
      </div>
      {data.actions === undefined || (data.actions !== null && data.actions.length === 0 && !data.handledThisWeek) ? null : (
        <ActionCards learnerId={id} cards={data.actions} tagLabels={data.today?.tagLabels ?? {}} role={shell.role} decisionsReady={data.decisionsReady ?? false} handledThisWeek={data.handledThisWeek ?? 0} />
      )}
      {data.moreActions && data.moreActions.length > 0 ? (
        <details data-testid="desk-more-actions" className="rounded-2xl border border-line bg-white p-3">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-accent">{deskCopy.moreActions(data.moreActions.length)}</summary>
          <ActionCards learnerId={id} cards={data.moreActions} tagLabels={data.today?.tagLabels ?? {}} role={shell.role} decisionsReady={data.decisionsReady ?? false} title={deskCopy.moreActionsTitle} id="viec-nen-lam-them" />
        </details>
      ) : null}
      <DeskInbox learnerId={id} pending={data.pending} need={data.assigned ? data.assigned.need : null} needAttempts={data.needAttempts ?? null} />
      {/* 27/11: after the waiting work (the daily first look), before the rest; gone when all six are done. */}
      {startCardVisible(start) ? <StartChecklist learnerId={id} alias={learner.alias} items={start} /> : null}
      <DeskAlerts learnerId={id} items={alerts} />
      {data.goal ? (
        <GoalBox
          learnerId={id}
          alias={learner.alias}
          canDecide={shell.role === "tutor"}
          view={{ goal: data.goal.goal, count: data.goal.count, streak: data.goal.streak, upcoming: data.goal.upcoming, pending: data.goal.pending, nextMonday: data.goal.nextMonday }}
        />
      ) : null}
      {parent && data.roadmap?.recentTitle ? (
        <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm" data-testid="desk-roadmap-line">
          {deskCopy.roadmapLine.parentNew(data.roadmap.recentTitle)}{" "}
          <Link href={roadmapHref(id)} className="font-medium text-accent underline">{deskCopy.roadmapLine.open}</Link>
        </p>
      ) : null}
      {!parent && data.roadmap && data.roadmap.proposals > 0 ? (
        <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm" data-testid="desk-roadmap-proposals">
          {deskCopy.roadmapLine.proposals(data.roadmap.proposals)}{" "}
          <Link href={roadmapHref(id)} className="font-medium text-accent underline">{deskCopy.roadmapLine.open}</Link>
        </p>
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <ProfileBox learnerId={id} alias={learner.alias} profile={data.profile} weak={data.today?.weak.tags ?? []} />
        <CurriculumBox learnerId={id} cards={data.curricula} />
        <SessionsBox learnerId={id} today={data.today} todayIso={todayIso} sessions={data.sessions} assigned={data.assigned ?? null} studioOverdue={data.studioOverdue ?? null} />
      </div>
      {data.handled && data.handled.length > 0 ? <HandledList items={data.handled} ready={data.decisionsReady ?? false} /> : null}
      {parent && data.recent ? <RecentLevelChanges items={data.recent} /> : null}
      {parent && data.aiSettings ? <AiSoftCapBox settings={data.aiSettings} /> : null}
    </div>
  );
}
