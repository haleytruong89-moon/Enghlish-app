"use client";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { shellCopy } from "@/lib/copy/vi";
import { type BadgeMemo, shouldFetch } from "@/lib/shell/badgeMemo";

type Memo = BadgeMemo & { count: string | null };
/** One remembered number per child (this tab). */
const memos = new Map<string, Memo>();
const listeners = new Set<() => void>();
let lastPath: string | null = null;
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** Test hook: forget what this tab remembered. */
export function resetInboxBadge(): void {
  memos.clear();
  lastPath = null;
  notify();
}

/** A page that already counted the waiting items (the desk, the inbox) tells the badge so it need not ask the route again. Browser only. */
export function seedInboxBadge(learnerId: string, count: string | null): void {
  if (typeof window === "undefined") return;
  memos.set(learnerId, { learnerId, at: Date.now(), count });
}
/** Wakes the badges after a seed (called from an effect, never while rendering). */
export const announceInboxBadge = notify;

/**
 * The number of things waiting, beside "Chờ duyệt". Read AFTER the page shows (the page never waits for it). Hidden when 0, unknown or
 * on a network error: never a false number.
 */
export function InboxBadge({ learnerId }: { learnerId: string }) {
  const pathname = usePathname() ?? "/";
  const count = useSyncExternalStore(subscribe, () => memos.get(learnerId)?.count ?? null, () => null);
  useEffect(() => {
    const left = lastPath;
    lastPath = pathname;
    if (!shouldFetch(memos.get(learnerId) ?? null, learnerId, Date.now(), left)) return; // the remembered (or page-seeded) number is on screen
    const ctl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/learners/${learnerId}/pending-count`, { signal: ctl.signal, cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { count?: string | null };
        memos.set(learnerId, { learnerId, at: Date.now(), count: typeof body.count === "string" ? body.count : null });
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
  if (count === null || count === "0") return null;
  return (
    <span data-testid="inbox-badge" aria-label={shellCopy.inboxBadge(count)} className="min-w-6 rounded-full bg-accent px-2 py-0.5 text-center text-xs font-semibold text-white">
      {count}
    </span>
  );
}
