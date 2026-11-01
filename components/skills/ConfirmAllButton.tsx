// components/skills/ConfirmAllButton.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { skillStateCopy } from "@/lib/copy/vi";
import { clientIdAfter } from "@/lib/levels/form";
import { failText, postJson } from "@/lib/tutorwork/client";

/** "Xác nhận tất cả" for one child (§3 step 4): exactly the level-up proposals on screen, never a ⚑ (the database refuses one too). */
export function ConfirmAllButton({ learnerId, ids }: { learnerId: string; ids: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [clientId, setClientId] = useState(() => crypto.randomUUID());

  async function confirmAll() {
    setMsg(null);
    setBusy(true);
    const r = await postJson(`/api/learners/${learnerId}/skills/confirm-all`, { client_id: clientId, ids });
    setBusy(false);
    setClientId(clientIdAfter(r, clientId));
    if (!r.ok) return setMsg(failText(r));
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" disabled={busy} onClick={confirmAll} data-testid={`skill-confirm-all-${learnerId}`} className="min-h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60">
        {busy ? skillStateCopy.saving : skillStateCopy.confirmAll(ids.length)}
      </button>
      <p className="text-xs text-muted">{skillStateCopy.confirmAllHint}</p>
      {msg ? (
        <p role="alert" className="text-sm font-medium text-[#7a2a0c]">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
