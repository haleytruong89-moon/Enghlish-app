/**
 * Which curriculum the mountain follows (Q9). Pure; SQL (eng_roadmap_main_id) uses the same rule and a DB test compares the two.
 *   1. the one the tutor chose last (roadmap_main_curriculum), if it has an approved version;
 *   2. else the approved curriculum with the most recent Unit event;
 *   3. else the approved curriculum created first.
 */
export type MainCandidate = { id: string; createdAt: string; approved: boolean; lastEventAt: string | null; lastEventId: string | null };

export function pickMainCurriculum(candidates: readonly MainCandidate[], chosenId: string | null): string | null {
  const approved = candidates.filter((c) => c.approved);
  if (chosenId !== null && approved.some((c) => c.id === chosenId)) return chosenId;
  const withEvents = approved.filter((c) => c.lastEventAt !== null);
  if (withEvents.length > 0) {
    return [...withEvents].sort((a, b) => (a.lastEventAt as string) < (b.lastEventAt as string) ? 1 : (a.lastEventAt as string) > (b.lastEventAt as string) ? -1 : (b.lastEventId ?? "").localeCompare(a.lastEventId ?? "") || a.id.localeCompare(b.id))[0]!.id;
  }
  return [...approved].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id.localeCompare(b.id)))[0]?.id ?? null;
}
