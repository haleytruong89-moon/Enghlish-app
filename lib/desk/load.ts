import "server-only";
import { loadCurriculumCards } from "@/lib/curriculum/load";
import type { CurriculumCard } from "@/lib/curriculum/shape";
import type { LearnerSummary } from "@/lib/home/visible";
import { loadLevelProfile, loadRecentLevelChanges } from "@/lib/levels/load";
import type { LevelProfile, RecentChange } from "@/lib/levels/types";
import { loadInbox } from "@/lib/review/load";
import type { InboxCursor, InboxItem } from "@/lib/review/types";
import { loadImportPending } from "@/lib/import/load";
import { draftCount, proposalCount, recentConfirmed } from "@/lib/roadmap/shape";
import { loadPointInbox } from "@/lib/points/load";
import { loadRoadmap, type RoadmapLoad } from "@/lib/roadmap/load";
import { sessionDays } from "@/lib/sessions/count";
import { loadSessionFacts } from "@/lib/sessions/load";
import type { SessionDay } from "@/lib/sessions/types";
import { loadSkillInbox } from "@/lib/skills/load";
import type { ShellData } from "@/lib/shell/shell";
import { loadAiSettings, loadDraftList, loadRetryPending, loadStudioPending } from "@/lib/studio/load";
import { buildBoard, type BoardTab } from "@/lib/assigned/board";
import { overdueFacts, type OverdueFacts } from "@/lib/assigned/duplicates";
import { todayVn } from "@/lib/inquiries/dates";
import { loadStudioAssigned } from "@/lib/studio/assignedLoad";
import type { AiSettingsView } from "@/lib/studio/types";
import { loadToday, type TodayData } from "@/lib/tutorwork/load";
import { pendingProposal } from "@/lib/student/goal";
import { loadWeekFactsResult, type WeekFactsResult } from "@/lib/student/weekLoad";
import { buildWeekView, type WeekView } from "@/lib/student/weekView";
import { loadIntake } from "@/lib/workdesk/load";
import type { StudioAssignedRow } from "@/lib/studio/assigned";
import { buildPendingRows, feedbackWaiting, PENDING_MAX_PAGES, PENDING_PAGE_SIZE, type PendingRow } from "./pending";

export type PendingSource = "work" | "studio" | "retries" | "skills" | "points" | "drafts" | "curricula" | "imports" | "roadmap" | "goals" | "feedback";
export type PendingRowsResult = { rows: PendingRow[]; failed: PendingSource[]; more: boolean };

async function settle<T>(p: Promise<T | null>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

/** Follows the inbox cursor (the RPC cannot filter by child) for at most PENDING_MAX_PAGES pages; `more` = a page remained. */
export async function loadWorkPages(): Promise<{ items: InboxItem[]; more: boolean }> {
  const items: InboxItem[] = [];
  let after: InboxCursor | null = null;
  for (let page = 0; page < PENDING_MAX_PAGES; page += 1) {
    const r = await loadInbox("todo", after, PENDING_PAGE_SIZE);
    items.push(...r.items);
    if (r.next === null) return { items, more: false };
    after = r.next;
  }
  return { items, more: true };
}

/**
 * "Chờ duyệt" of one child. Call ONLY after the page gate of that child (loadDraftList uses the admin client). Never throws: a source
 * that cannot be read (error, or null before its migration) is listed in `failed` and the others still show.
 */
export async function loadPendingRows(
  memberId: string, role: "tutor" | "parent", learnerId: string, roadmapLoad?: Promise<RoadmapLoad | null>, goalLoad?: Promise<WeekFactsResult | null>,
  assignedLoad?: Promise<StudioAssignedRow[] | null>,
): Promise<PendingRowsResult> {
  const [work, studio, retries, skills, points, drafts, curricula, imports, roadmap, goal, assigned] = await Promise.all([
    settle(loadWorkPages()),
    settle(loadStudioPending(memberId)),
    settle(loadRetryPending(memberId)),
    settle(loadSkillInbox(memberId)),
    settle(loadPointInbox(memberId)),
    settle(loadDraftList(learnerId)),
    settle(loadCurriculumCards(learnerId)),
    settle(loadImportPending(memberId)),
    roadmapLoad ?? settle(loadRoadmap(learnerId)),
    goalLoad ?? settle(loadWeekFactsResult(learnerId)),
    assignedLoad ?? settle(loadStudioAssigned(learnerId, todayVn())),
  ]);
  const failed: PendingSource[] = [];
  if (work === null) failed.push("work");
  if (studio === null) failed.push("studio");
  if (retries === null) failed.push("retries");
  if (skills === null) failed.push("skills");
  if (points === null) failed.push("points");
  if (drafts === null) failed.push("drafts");
  if (curricula === null) failed.push("curricula");
  if (imports === null) failed.push("imports");
  if (roadmap === null) failed.push("roadmap");
  if (goal === null) failed.push("goals"); // only a real fault: migration 0035 not applied is { kind: "unavailable" }
  if (assigned === null) failed.push("feedback");
  return {
    rows: buildPendingRows({ learnerId, role, work: work?.items ?? [], studio: studio?.attempts ?? [], retries: retries?.attempts ?? [], skills: skills?.items ?? [], points: points?.items ?? [], drafts: drafts ?? [], curricula: curricula ?? [], imports: imports ?? [], roadmapDrafts: roadmap && roadmap.kind === "ok" ? draftCount(roadmap.view) : 0, goal: goalProposal(goal), feedback: feedbackWaiting(assigned ?? []) }),
    failed,
    more: work?.more ?? false,
  };
}

/** The proposal of the child that nobody answered yet (W4d), as "Chờ duyệt" needs it. */
function goalProposal(r: WeekFactsResult | null): { id: string; pieces: number; since: string } | null {
  if (!r || r.kind !== "ok") return null;
  const p = pendingProposal(r.facts.goals);
  return p && p.pieces !== null ? { id: p.id, pieces: p.pieces, since: p.createdAt } : null;
}

export type DeskData = {
  today: TodayData | null;
  pending: PendingRowsResult;
  intakeMissing: boolean | null;
  curricula: CurriculumCard[] | null;
  profile: LevelProfile | null;
  recent: RecentChange[] | null;
  aiSettings: AiSettingsView | null;
  /** Counted session days (U9/U10) for the one-line summary; null when the notes could not be read. */
  sessions: SessionDay[] | null;
  /** Roadmap facts for the desk (W4a): milestones after a vanished Unit, and the newest milestone confirmed this week. null = unknown / not applied. */
  roadmap: { orphans: number; recentTitle: string | null; proposals: number } | null;
  /** The weekly goal of the child (W4d): this week, the streak, the proposal waiting. null = not applied / unreadable (the box is left out). */
  goal?: WeekView | null;
  /** Studio tests overdue with nothing sent (21/11); null = unreadable. */
  studioOverdue?: number | null;
  /** Q6: overdue Studio tests with how many look given twice / are long late; null = unreadable. */
  studioOverdueFacts?: OverdueFacts | null;
  /** Q3: the tab counts of "Bài đã giao" (same `buildBoard` as that page); null = the Studio list could not be read. */
  assigned?: Record<BoardTab, number> | null;
};

function roadmapFacts(r: Awaited<ReturnType<typeof loadRoadmap>> | null): DeskData["roadmap"] {
  if (!r || r.kind !== "ok") return null;
  return { orphans: r.view.orphanIds.length, recentTitle: recentConfirmed(r.view.cards, Date.now())?.title ?? null, proposals: proposalCount(r.view) };
}

/** Everything the desk of one child needs. Call ONLY after the page gate of that child (admin-client loaders). Never throws. */
export async function loadDesk(shell: ShellData, learner: LearnerSummary): Promise<DeskData> {
  const parent = shell.role === "parent";
  const roadmapLoad = settle(loadRoadmap(learner.id)); // ONE eng_roadmap call per desk load, shared by the inbox rows and the desk facts
  const goalLoad = settle(loadWeekFactsResult(learner.id)); // ONE eng_week_facts call, shared by the inbox row and the goal box
  const studioLoad = settle(loadStudioAssigned(learner.id, todayVn())); // ONE read, shared by the inbox (feedback rows) and the desk facts
  const [today, pending, intake, curricula, profile, recent, aiSettings, facts, roadmap, goal, studio] = await Promise.all([
    settle(loadToday(learner.id, learner.trackId, { role: shell.role, memberId: shell.memberId })),
    loadPendingRows(shell.memberId, shell.role, learner.id, roadmapLoad, goalLoad, studioLoad),
    settle(loadIntake(learner.id)),
    settle(loadCurriculumCards(learner.id)),
    settle(loadLevelProfile(learner.id)),
    parent ? settle(loadRecentLevelChanges(shell.learners)) : Promise.resolve(null),
    parent ? settle(loadAiSettings(shell.memberId)) : Promise.resolve(null),
    settle(loadSessionFacts(learner.id)),
    roadmapLoad,
    goalLoad,
    studioLoad,
  ]);
  const overdue = studio ? overdueFacts(studio) : null;
  return {
    studioOverdue: overdue ? overdue.overdue : null,
    studioOverdueFacts: overdue,
    assigned: studio && today ? buildBoard(studio, today.assignments ?? today.practice, todayVn()).counts : null,
    today, pending, intakeMissing: intake && intake.available ? intake.data === null : null, curricula, profile, recent, aiSettings, roadmap: roadmapFacts(roadmap), goal: goal && goal.kind === "ok" ? buildWeekView(goal.facts) : null, sessions: facts ? sessionDays(facts.notes, [], () => null, facts.marks) : null };
}
