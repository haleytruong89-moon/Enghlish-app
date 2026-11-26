import { describe, expect, it } from "vitest";
import { finishHref, isFinishHref } from "@/lib/finish/paths";
import { buildFinishQueue, queuePlace } from "@/lib/finish/queue";
import type { PendingAttempt, RetryAttempt } from "@/lib/studio/types";

const L = "b0000000-0000-4000-8000-000000000001";
const other = "a0000000-0000-4000-8000-000000000001";
const pend = (attemptId: string, submittedAt: string, learnerId = L): PendingAttempt => ({ attemptId, learnerId, alias: "Nguyên", isTest: true, activityId: "x", title: `T-${attemptId}`, submittedAt, attemptNo: 1, waitingDays: 1, items: [] });
const retry = (attemptId: string, since: string): RetryAttempt => ({ attemptId, learnerId: L, alias: "Nguyên", isTest: true, activityId: "x", title: `T-${attemptId}`, submittedAt: since, since, retries: [] });

describe("L1 queue", () => {
  const q = buildFinishQueue({
    learnerId: L,
    pending: [pend("a2", "2026-11-20T03:00:00Z"), pend("zz", "2026-11-01T00:00:00Z", other)],
    retries: [retry("a2", "2026-11-21T03:00:00Z"), retry("a3", "2026-11-22T03:00:00Z")],
    feedback: [{ attemptId: "a1", title: "T-a1", since: "2026-11-15T08:00:00Z", href: "" }, { attemptId: "a2", title: "T-a2", since: "2026-11-20T03:00:00Z", href: "" }],
  });
  it("one entry per attempt of THIS child, oldest first, with what each needs", () => {
    expect(q.map((e) => [e.attemptId, e.needs])).toEqual([["a1", ["feedback"]], ["a2", ["check", "retry", "feedback"]], ["a3", ["retry"]]]);
    expect(q[1]!.since).toBe("2026-11-20T03:00:00Z");
  });
  it("place: n of N with prev / next; a finished attempt points at the oldest left", () => {
    expect(queuePlace(q, "a2")).toMatchObject({ index: 2, total: 3, prev: { attemptId: "a1" }, next: { attemptId: "a3" } });
    expect(queuePlace(q, "done")).toMatchObject({ index: null, total: 3, prev: null, next: { attemptId: "a1" } });
    expect(queuePlace([], "x")).toEqual({ index: null, total: 0, prev: null, next: null });
  });
  it("paths", () => {
    expect(finishHref(L)).toBe(`/learners/${L}/finish`);
    expect(finishHref(L, "a1")).toBe(`/learners/${L}/finish/a1`);
    expect(isFinishHref(finishHref(L, "a1"))).toBe(true);
    expect(isFinishHref(`/review/studio#studio-a1`)).toBe(false);
  });
});
