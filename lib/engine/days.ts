import type { Exposure } from "./types";

const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;

/** D7: day number of a moment in Vietnam (UTC+7, no daylight saving). Two moments of the same Vietnamese calendar day give the same number. */
export function vnDay(at: string | Date): number {
  const t = typeof at === "string" ? Date.parse(at) : at.getTime();
  return Math.floor((t + VN_OFFSET_MS) / DAY_MS);
}

/**
 * D8: whole Vietnamese days between `at` and the latest practice of the skill BEFORE it, from another attempt. With a topic: practice on that
 * topic or in a lesson (no topic); if the topic has none, any practice. Without a topic (route 2): any practice. No practice at all → null.
 */
export function daysSinceLastPractice(exposures: readonly Exposure[], at: string, attemptId: string, contextId: string | null): number | null {
  const t = Date.parse(at);
  const before = exposures.filter((x) => x.attemptId !== attemptId && Date.parse(x.at) < t);
  const sameTopic = contextId === null ? before : before.filter((x) => x.contextId === contextId || x.contextId === null);
  const pool = sameTopic.length > 0 ? sameTopic : before;
  if (pool.length === 0) return null;
  const last = pool.reduce((m, x) => Math.max(m, Date.parse(x.at)), Number.NEGATIVE_INFINITY);
  return vnDay(at) - vnDay(new Date(last));
}
