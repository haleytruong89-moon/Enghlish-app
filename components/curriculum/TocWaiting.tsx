"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { curriculumCopy } from "@/lib/copy/vi";

const EVERY_MS = 3000;

/** "AI đang đọc mục lục…": asks the version's status every 3 s; when it is no longer extracting, the page reloads itself. */
export function TocWaiting({ versionId }: { versionId: string }) {
  const router = useRouter();
  useEffect(() => {
    let stop = false;
    const timer = setInterval(async () => {
      if (stop) return;
      const res = await fetch(`/api/curricula/versions/${versionId}?view=status`, { cache: "no-store" }).catch(() => null);
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
  }, [versionId, router]);
  return (
    <section role="status" aria-live="polite" data-testid="toc-waiting" className="mt-6 rounded-2xl border border-line bg-white p-5">
      <p className="text-lg font-semibold text-accent">{curriculumCopy.reading}</p>
      <p className="mt-1 text-sm text-muted">{curriculumCopy.readingHint}</p>
    </section>
  );
}
