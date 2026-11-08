"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { importCopy } from "@/lib/copy/vi";
import { importErrorText, sendJson } from "@/lib/import/client";

const btn = "inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold disabled:opacity-60";

/**
 * The AI could not read the paper: "Thử lại" asks again on the SAME import (no duplicate), "Soạn tay" opens an empty draft to type, "Bỏ bài này"
 * drops it (also frees the same file for a new import). Used for a failed read; the waiting screen has its own "Bỏ bài này".
 */
export function ImportFailed({ importId, learnerId, reason }: { importId: string; learnerId: string; reason: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function go(path: string, body: Record<string, unknown>, after: "refresh" | "leave") {
    setBusy(true);
    setProblem(null);
    const r = await sendJson(`/api/imports/${importId}/${path}`, "POST", body);
    setBusy(false);
    if (!r.ok) return setProblem(importErrorText(r.error));
    if (after === "leave") router.push(`/learners/${learnerId}/knowledge`);
    else router.refresh();
  }
  return (
    <section role="alert" data-testid="import-ai-failed" className="mt-4 rounded-2xl border border-[#E9C46A] bg-[#FBF1DC] p-4 text-[#6B4600]">
      <p className="font-semibold">{importCopy.readFailed}</p>
      {reason && importCopy.failReasons[reason] ? <p className="text-sm">{importCopy.readFailedWhy(importCopy.failReasons[reason]!)}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void go("retry", { mode: "retry" }, "refresh")} data-testid="import-retry" className={`${btn} bg-accent text-white`}>
          {importCopy.tryAgain}
        </button>
        <button type="button" disabled={busy} onClick={() => void go("retry", { mode: "manual" }, "refresh")} data-testid="import-go-manual" className={`${btn} border border-accent text-accent`}>
          {importCopy.manual}
        </button>
        <button type="button" disabled={busy} onClick={() => void go("discard", {}, "leave")} data-testid="import-discard-failed" className={`${btn} border border-line bg-white text-ink`}>
          {importCopy.discard}
        </button>
      </div>
      {problem ? <p role="alert" className="mt-2 text-sm font-medium">{problem}</p> : null}
    </section>
  );
}
