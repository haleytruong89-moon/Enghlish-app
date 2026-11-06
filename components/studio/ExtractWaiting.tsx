// components/studio/ExtractWaiting.tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { studioCopy } from "@/lib/copy/vi";

const EVERY_MS = 3000;
const GIVE_UP_MS = 6 * 60 * 1000;

/** "AI đang đọc đề…" (spec §3 step 2): asks the draft's status every 3 s; when it is no longer extracting, the page reloads itself. */
export function ExtractWaiting({ draftId }: { draftId: string }) {
  const router = useRouter();
  const [tooLong, setTooLong] = useState(false);
  useEffect(() => {
    const started = Date.now();
    let stop = false;
    const timer = setInterval(async () => {
      if (stop) return;
      if (Date.now() - started > GIVE_UP_MS) setTooLong(true);
      const res = await fetch(`/api/studio/drafts/${draftId}?view=status`, { cache: "no-store" }).catch(() => null);
      const body = res && res.ok ? ((await res.json()) as { status: string }) : null;
      if (body && body.status !== "extracting") {
        stop = true;
        clearInterval(timer);
        router.refresh();
      }
    }, EVERY_MS);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [draftId, router]);
  return (
    <section role="status" aria-live="polite" data-testid="extract-waiting" className="mt-6 rounded-2xl border border-line bg-white p-5">
      <p className="text-lg font-semibold text-accent">{studioCopy.reading}</p>
      <p className="mt-1 text-sm text-muted">{tooLong ? studioCopy.readingTooLong : studioCopy.readingHint}</p>
    </section>
  );
}
