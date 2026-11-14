"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { shellCopy } from "@/lib/copy/vi";
import { type BadgeMemo, shouldFetch } from "@/lib/shell/badgeMemo";

type Memo = BadgeMemo & { count: string | null };
/** One remembered number per child (this tab). */
const memos = new Map<string, Memo>();
let lastPath: string | null = null;

/** Test hook: forget what this tab remembered. */
export function resetInboxBadge(): void {
  memos.clear();
  lastPath = null;
}

/** A page that already counted the waiting items (the desk, the inbox) tells the badge so it need not ask the route again. Browser only. */
export function seedInboxBadge(learnerId: string, count: string | null): void {
  if (typeof window === "undefined") return;
  memos.set(learnerId, { learnerId, at: Date.now(), count });
}

/**
 * The number of things waiting, beside "Chờ duyệt". Read AFTER the page shows (the page never waits for it). Hidden when 0, unknown or
 * on a network error: never a false number.
 */
export function InboxBadge({ learnerId }: { learnerId: string }) {
  const pathname = usePathname() ?? "/";
  const first = memos.get(learnerId);
  const [got, setGot] = useState<{ learnerId: string; count: string | null } | null>(first ? { learnerId, count: first.count } : null);
  const count = got && got.learnerId === learnerId ? got.count : null;
  useEffect(() => {
    const left = lastPath;
    lastPath = pathname;
    const known = memos.get(learnerId) ?? null;
    if (!shouldFetch(known, learnerId, Date.now(), left)) {
      // The remembered (or page-seeded) number is the one to show.
      if (known) setGot({ learnerId, count: known.count });
      return;
    }
    const ctl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/learners/${learnerId}/pending-count`, { signal: ctl.signal, cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { count?: string | null };
        const c = typeof body.count === "string" ? body.count : null;
        memos.set(learnerId, { learnerId, at: Date.now(), count: c });
        setGot({ learnerId, count: c });
      } catch {
        if (!ctl.signal.aborted) setGot({ learnerId, count: null });
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
