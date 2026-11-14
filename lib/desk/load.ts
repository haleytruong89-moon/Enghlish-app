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
import { loadAiSettings, loadDraftList, loadStudioPending } from "@/lib/studio/load";
import type { AiSettingsView } from "@/lib/studio/types";
import { loadToday, type TodayData } from "@/lib/tutorwork/load";
import { loadIntake } from "@/lib/workdesk/load";
import { buildPendingRows, PENDING_MAX_PAGES, PENDING_PAGE_SIZE, type PendingRow } from "./pending";

export type PendingSource = "work" | "studio" | "skills" | "points" | "drafts" | "curricula" | "imports" | "roadmap";
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
export async function loadPendingRows(memberId: string, role: "tutor" | "parent", learnerId: string, roadmapLoad?: Promise<RoadmapLoad | null>): Promise<PendingRowsResult> {
  const [work, studio, skills, points, drafts, curricula, imports, roadmap] = await Promise.all([
    settle(loadWorkPages()),
    settle(loadStudioPending(memberId)),
    settle(loadSkillInbox(memberId)),
    settle(loadPointInbox(memberId)),
    settle(loadDraftList(learnerId)),
    settle(loadCurriculumCards(learnerId)),
    settle(loadImportPending(memberId)),
    roadmapLoad ?? settle(loadRoadmap(learnerId)),
  ]);
  const failed: PendingSource[] = [];
  if (work === null) failed.push("work");
  if (studio === null) failed.push("studio");
  if (skills === null) failed.push("skills");
  if (points === null) failed.push("points");
  if (drafts === null) failed.push("drafts");
  if (curricula === null) failed.push("curricula");
  if (imports === null) failed.push("imports");
  if (roadmap === null) failed.push("roadmap");
  return {
    rows: buildPendingRows({ learnerId, role, work: work?.items ?? [], studio: studio?.attempts ?? [], skills: skills?.items ?? [], points: points?.items ?? [], drafts: drafts ?? [], curricula: curricula ?? [], imports: imports ?? [], roadmapDrafts: roadmap && roadmap.kind === "ok" ? draftCount(roadmap.view) : 0 }),
    failed,
    more: work?.more ?? false,
  };
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
};

function roadmapFacts(r: Awaited<ReturnType<typeof loadRoadmap>> | null): DeskData["roadmap"] {
  if (!r || r.kind !== "ok") return null;
  return { orphans: r.view.orphanIds.length, recentTitle: recentConfirmed(r.view.cards, Date.now())?.title ?? null, proposals: proposalCount(r.view) };
}

/** Everything the desk of one child needs. Call ONLY after the page gate of that child (admin-client loaders). Never throws. */
export async function loadDesk(shell: ShellData, learner: LearnerSummary): Promise<DeskData> {
  const parent = shell.role === "parent";
  const roadmapLoad = settle(loadRoadmap(learner.id)); // ONE eng_roadmap call per desk load, shared by the inbox rows and the desk facts
  const [today, pending, intake, curricula, profile, recent, aiSettings, facts, roadmap] = await Promise.all([
    settle(loadToday(learner.id, learner.trackId, { role: shell.role, memberId: shell.memberId })),
    loadPendingRows(shell.memberId, shell.role, learner.id, roadmapLoad),
    settle(loadIntake(learner.id)),
    settle(loadCurriculumCards(learner.id)),
    settle(loadLevelProfile(learner.id)),
    parent ? settle(loadRecentLevelChanges(shell.learners)) : Promise.resolve(null),
    parent ? settle(loadAiSettings(shell.memberId)) : Promise.resolve(null),
    settle(loadSessionFacts(learner.id)),
    roadmapLoad,
  ]);
  return { today, pending, intakeMissing: intake && intake.available ? intake.data === null : null, curricula, profile, recent, aiSettings, roadmap: roadmapFacts(roadmap), sessions: facts ? sessionDays(facts.notes, [], () => null, facts.marks) : null };
}
