"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { importCopy } from "@/lib/copy/vi";

const EVERY_MS = 3000;

/** "AI đang đọc bài…": asks the import's status every 3 s; when it is no longer reading, the page reloads itself. */
export function ImportWaiting({ importId }: { importId: string }) {
  const router = useRouter();
  useEffect(() => {
    let stop = false;
    const timer = setInterval(async () => {
      if (stop) return;
      const res = await fetch(`/api/imports/${importId}?view=status`, { cache: "no-store" }).catch(() => null);
      const body = res && res.ok ? ((await res.json()) as { status: string }) : null;
      if (body && body.status !== "reading") {
        stop = true;
        clearInterval(timer);
        router.refresh();
      }
    }, EVERY_MS);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [importId, router]);
  return (
    <section role="status" aria-live="polite" data-testid="import-waiting" className="mt-6 rounded-2xl border border-line bg-white p-5">
      <p className="text-lg font-semibold text-accent">{importCopy.reading}</p>
    </section>
  );
}
