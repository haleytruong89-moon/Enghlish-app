"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useState } from "react";
import { importCopy } from "@/lib/copy/vi";
import { importErrorText, sendJson } from "@/lib/import/client";

const EVERY_MS = 3000;

/** "AI đang đọc bài…": asks the import's status every 3 s; when it is no longer reading, the page reloads itself. */
export function ImportWaiting({ importId, learnerId }: { importId: string; learnerId: string }) {
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(null);
  async function discard() {
    const r = await sendJson(`/api/imports/${importId}/discard`, "POST", {});
    if (!r.ok) return setProblem(importErrorText(r.error));
    router.push(`/learners/${learnerId}/knowledge`);
  }
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
      <button type="button" onClick={() => void discard()} data-testid="import-discard-waiting" className="mt-3 min-h-11 rounded-lg border border-line px-4 text-sm font-semibold">
        {importCopy.discard}
      </button>
      {problem ? <p role="alert" className="mt-2 text-sm">{problem}</p> : null}
    </section>
  );
}
