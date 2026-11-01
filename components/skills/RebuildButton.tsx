// components/skills/RebuildButton.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { skillStateCopy } from "@/lib/copy/vi";
import { failText, postJson } from "@/lib/tutorwork/client";

/** "Tính lại từ đầu" (§3 step 6): tutor or parent. Idempotent on the server, so no client id. */
export function RebuildButton({ learnerId }: { learnerId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function rebuild() {
    setMsg(null);
    setBusy(true);
    const r = await postJson<{ proposed: number }>(`/api/learners/${learnerId}/skills/rebuild`, {});
    setBusy(false);
    if (!r.ok) return setMsg(failText(r));
    setMsg(skillStateCopy.rebuildDone(r.body.proposed));
    router.refresh();
  }

  return (
    <div className="mt-6 flex flex-col gap-1">
      <button type="button" disabled={busy} onClick={rebuild} data-testid="skills-rebuild" className="min-h-11 self-start rounded-lg border border-accent px-4 text-sm font-semibold text-accent disabled:opacity-60">
        {busy ? skillStateCopy.saving : skillStateCopy.rebuild}
      </button>
      <p className="text-xs text-muted">{skillStateCopy.rebuildHint}</p>
      {msg ? (
        <p role="status" data-testid="skills-rebuild-msg" className="text-sm">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
