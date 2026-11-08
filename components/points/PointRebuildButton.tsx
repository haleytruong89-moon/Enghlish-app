// components/points/PointRebuildButton.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { pointStateCopy } from "@/lib/copy/vi";
import { failText, postJson } from "@/lib/tutorwork/client";

/** "Tính lại mức điểm từ đầu": tutor or parent. Idempotent on the server, so no client id. */
export function PointRebuildButton({ learnerId }: { learnerId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function rebuild() {
    setMsg(null);
    setBusy(true);
    const r = await postJson<{ proposed: number }>(`/api/learners/${learnerId}/points/rebuild`, {});
    setBusy(false);
    if (!r.ok) return setMsg(failText(r));
    setMsg(pointStateCopy.rebuildDone(r.body.proposed));
    router.refresh();
  }

  return (
    <div className="mt-6 flex flex-col gap-1">
      <button type="button" disabled={busy} onClick={rebuild} data-testid="points-rebuild" className="min-h-11 self-start rounded-lg border border-accent px-4 text-sm font-semibold text-accent disabled:opacity-60">
        {busy ? pointStateCopy.saving : pointStateCopy.rebuild}
      </button>
      <p className="text-xs text-muted">{pointStateCopy.rebuildHint}</p>
      {msg ? (
        <p role="status" data-testid="points-rebuild-msg" className="text-sm">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
