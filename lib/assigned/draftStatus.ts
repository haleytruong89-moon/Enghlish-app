import "server-only";
import { loadCurriculumCards, loadUnitAuto } from "@/lib/curriculum/load";
import { mainCurriculum } from "@/lib/curriculum/main";
import type { UnitStatus } from "@/lib/curriculum/types";

/**
 * The Unit statuses of a child's main curriculum, only to order the drafts (Giao bài, Bài tập › Bản nháp). null when there is no
 * main curriculum or it cannot be read: the drafts still show, by Unit number, with no "Kế tiếp". Reads under the caller's session (RLS).
 */
export async function loadDraftUnitStatus(learnerId: string): Promise<Readonly<Record<string, UnitStatus>> | null> {
  try {
    const auto = await loadUnitAuto(learnerId);
    return mainCurriculum(await loadCurriculumCards(learnerId, auto), auto.mainId)?.progress?.statusOf ?? null;
  } catch {
    return null;
  }
}
