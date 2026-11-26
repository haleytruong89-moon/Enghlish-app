/**
 * L1 · the submissions of one child that still need an adult, oldest first: questions the app left to a person, the child's retries
 * not looked at yet, and Studio work without feedback (the same Studio parts "Chờ duyệt" lists). One entry per attempt. Pure.
 */
import type { FeedbackWaiting } from "@/lib/desk/pending";
import type { PendingAttempt, RetryAttempt } from "@/lib/studio/types";

export type QueueNeed = "check" | "retry" | "feedback";
export type QueueEntry = { attemptId: string; title: string; since: string; needs: QueueNeed[] };

const ORDER: readonly QueueNeed[] = ["check", "retry", "feedback"];

export function buildFinishQueue(i: { learnerId: string; pending: readonly PendingAttempt[]; retries: readonly RetryAttempt[]; feedback: readonly FeedbackWaiting[] }): QueueEntry[] {
  const out = new Map<string, QueueEntry>();
  const add = (attemptId: string, title: string, since: string, need: QueueNeed) => {
    const cur = out.get(attemptId);
    if (!cur) return void out.set(attemptId, { attemptId, title, since, needs: [need] });
    out.set(attemptId, {
      ...cur,
      since: Date.parse(since) < Date.parse(cur.since) ? since : cur.since,
      needs: ORDER.filter((n) => n === need || cur.needs.includes(n)),
    });
  };
  for (const a of i.pending) if (a.learnerId === i.learnerId) add(a.attemptId, a.title, a.submittedAt, "check");
  for (const a of i.retries) if (a.learnerId === i.learnerId) add(a.attemptId, a.title, a.since, "retry");
  for (const f of i.feedback) add(f.attemptId, f.title, f.since, "feedback");
  return [...out.values()].sort((a, b) => Date.parse(a.since) - Date.parse(b.since) || a.attemptId.localeCompare(b.attemptId));
}

/** Where this attempt sits in the queue. Not in it (done): `next` is the oldest one left. */
export function queuePlace(q: readonly QueueEntry[], attemptId: string): { index: number | null; total: number; prev: QueueEntry | null; next: QueueEntry | null } {
  const at = q.findIndex((e) => e.attemptId === attemptId);
  if (at < 0) return { index: null, total: q.length, prev: null, next: q[0] ?? null };
  return { index: at + 1, total: q.length, prev: q[at - 1] ?? null, next: q[at + 1] ?? null };
}
