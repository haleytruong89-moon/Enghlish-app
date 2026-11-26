import "server-only";
import { loadAssignments } from "@/lib/practice/load";
import { loadStudioAssigned } from "@/lib/studio/assignedLoad";
import { buildBoard } from "./board";

/**
 * Hướng B (review of PR1): the number on "Chấm bài" = the "Cần chấm" tab of Bài tập (same `buildBoard`), so the button, the tab and
 * Hôm nay never disagree. null when either list cannot be read (never a false 0). Call ONLY after the gate of that child (admin reads).
 */
export async function loadNeedCount(learnerId: string, todayIso: string): Promise<number | null> {
  const [studio, assignments] = await Promise.all([
    loadStudioAssigned(learnerId, todayIso).catch(() => null),
    loadAssignments(learnerId, { units: false }).catch(() => null),
  ]);
  if (studio === null || assignments === null) return null;
  return buildBoard(studio, assignments, todayIso).counts.need;
}
