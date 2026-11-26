"use client";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { type BadgeMemo, shouldFetch } from "@/lib/shell/badgeMemo";

export type BadgeCounts = { count: string | null; work: string | null };
type Memo = BadgeMemo & BadgeCounts;
const NONE: BadgeCounts = { count: null, work: null };
/** One remembered pair per child (this tab). */
const memos = new Map<string, Memo>();
const listeners = new Set<() => void>();
let lastPath: string | null = null;
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
/** Stable snapshot object per memo, so useSyncExternalStore does not loop. */
const snapshot = (learnerId: string): BadgeCounts => memos.get(learnerId) ?? NONE;

/** Test hook: forget what this tab remembered. */
export function resetBadge(): void {
  memos.clear();
  lastPath = null;
  notify();
}
/** A page that already counted (Hôm nay, Việc khác) hands the numbers over so the route is not asked again. Browser only. */
export function seedBadge(learnerId: string, c: BadgeCounts): void {
  if (typeof window === "undefined") return;
  memos.set(learnerId, { learnerId, at: Date.now(), count: c.count, work: c.work });
}
export const announceBadge = notify;

/**
 * The two numbers, read AFTER the page shows (the page never waits for them). Unknown / network error → both null: never a false
 * number. Same 30 s memo and "re-read after a decision page" rule as before (lib/shell/badgeMemo.ts).
 */
export function useBadgeCounts(learnerId: string | null): BadgeCounts {
  const pathname = usePathname() ?? "/";
  const counts = useSyncExternalStore(subscribe, () => (learnerId ? snapshot(learnerId) : NONE), () => NONE);
  useEffect(() => {
    if (!learnerId) return;
    const left = lastPath;
    lastPath = pathname;
    if (!shouldFetch(memos.get(learnerId) ?? null, learnerId, Date.now(), left)) return;
    const ctl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/learners/${learnerId}/pending-count`, { signal: ctl.signal, cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { count?: unknown; work?: unknown };
        const s = (v: unknown) => (typeof v === "string" ? v : null);
        memos.set(learnerId, { learnerId, at: Date.now(), count: s(body.count), work: s(body.work) });
        notify();
      } catch {
        if (!ctl.signal.aborted) {
          memos.delete(learnerId);
          notify();
        }
      }
    })();
    return () => ctl.abort();
  }, [learnerId, pathname]);
  return counts;
}
