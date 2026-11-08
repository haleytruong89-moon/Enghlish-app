import "server-only";
import { loadCurriculumCards } from "@/lib/curriculum/load";
import type { CurriculumCard } from "@/lib/curriculum/shape";
import type { LearnerSummary } from "@/lib/home/visible";
import { loadLevelProfile, loadRecentLevelChanges } from "@/lib/levels/load";
import type { LevelProfile, RecentChange } from "@/lib/levels/types";
import { loadInbox } from "@/lib/review/load";
import type { InboxCursor, InboxItem } from "@/lib/review/types";
import { loadImportPending } from "@/lib/import/load";
import { loadPointInbox } from "@/lib/points/load";
import { loadSkillInbox } from "@/lib/skills/load";
import type { ShellData } from "@/lib/shell/shell";
import { loadAiSettings, loadDraftList, loadStudioPending } from "@/lib/studio/load";
import type { AiSettingsView } from "@/lib/studio/types";
import { loadToday, type TodayData } from "@/lib/tutorwork/load";
import { loadIntake } from "@/lib/workdesk/load";
import { buildPendingRows, PENDING_MAX_PAGES, PENDING_PAGE_SIZE, type PendingRow } from "./pending";

export type PendingSource = "work" | "studio" | "skills" | "points" | "drafts" | "curricula" | "imports";
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
export async function loadPendingRows(memberId: string, role: "tutor" | "parent", learnerId: string): Promise<PendingRowsResult> {
  const [work, studio, skills, points, drafts, curricula, imports] = await Promise.all([
    settle(loadWorkPages()),
    settle(loadStudioPending(memberId)),
    settle(loadSkillInbox(memberId)),
    settle(loadPointInbox(memberId)),
    settle(loadDraftList(learnerId)),
    settle(loadCurriculumCards(learnerId)),
    settle(loadImportPending(memberId)),
  ]);
  const failed: PendingSource[] = [];
  if (work === null) failed.push("work");
  if (studio === null) failed.push("studio");
  if (skills === null) failed.push("skills");
  if (points === null) failed.push("points");
  if (drafts === null) failed.push("drafts");
  if (curricula === null) failed.push("curricula");
  if (imports === null) failed.push("imports");
  return {
    rows: buildPendingRows({ learnerId, role, work: work?.items ?? [], studio: studio?.attempts ?? [], skills: skills?.items ?? [], points: points?.items ?? [], drafts: drafts ?? [], curricula: curricula ?? [], imports: imports ?? [] }),
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
};

/** Everything the desk of one child needs. Call ONLY after the page gate of that child (admin-client loaders). Never throws. */
export async function loadDesk(shell: ShellData, learner: LearnerSummary): Promise<DeskData> {
  const parent = shell.role === "parent";
  const [today, pending, intake, curricula, profile, recent, aiSettings] = await Promise.all([
    settle(loadToday(learner.id, learner.trackId, { role: shell.role, memberId: shell.memberId })),
    loadPendingRows(shell.memberId, shell.role, learner.id),
    settle(loadIntake(learner.id)),
    settle(loadCurriculumCards(learner.id)),
    settle(loadLevelProfile(learner.id)),
    parent ? settle(loadRecentLevelChanges(shell.learners)) : Promise.resolve(null),
    parent ? settle(loadAiSettings(shell.memberId)) : Promise.resolve(null),
  ]);
  return { today, pending, intakeMissing: intake && intake.available ? intake.data === null : null, curricula, profile, recent, aiSettings };
}
