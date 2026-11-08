import "server-only";
import { loadCurriculumCards } from "@/lib/curriculum/load";
import { loadInbox } from "@/lib/review/load";
import { loadSkillInbox } from "@/lib/skills/load";
import { loadDraftList, loadStudioPending } from "@/lib/studio/load";
import { buildPendingRows, PENDING_LOAD_LIMIT, type PendingRow } from "./pending";

export type PendingSource = "work" | "studio" | "skills" | "drafts" | "curricula";
export type PendingRowsResult = { rows: PendingRow[]; failed: PendingSource[]; more: boolean };

async function settle<T>(p: Promise<T | null>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

/**
 * "Chờ duyệt" of one child. Call ONLY after the page gate of that child (loadDraftList uses the admin client). Never throws: a source
 * that cannot be read (error, or null before its migration) is listed in `failed` and the others still show.
 */
export async function loadPendingRows(memberId: string, role: "tutor" | "parent", learnerId: string): Promise<PendingRowsResult> {
  const [work, studio, skills, drafts, curricula] = await Promise.all([
    settle(loadInbox("todo", null, PENDING_LOAD_LIMIT)),
    settle(loadStudioPending(memberId)),
    settle(loadSkillInbox(memberId)),
    settle(loadDraftList(learnerId)),
    settle(loadCurriculumCards(learnerId)),
  ]);
  const failed: PendingSource[] = [];
  if (work === null) failed.push("work");
  if (studio === null) failed.push("studio");
  if (skills === null) failed.push("skills");
  if (drafts === null) failed.push("drafts");
  if (curricula === null) failed.push("curricula");
  return {
    rows: buildPendingRows({ learnerId, role, work: work?.items ?? [], studio: studio?.attempts ?? [], skills: skills?.items ?? [], drafts: drafts ?? [], curricula: curricula ?? [] }),
    failed,
    more: (work?.next ?? null) !== null,
  };
}
