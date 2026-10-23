// components/skills/ManualForm.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { levelLabels, skillStateCopy } from "@/lib/copy/vi";
import type { SkillState } from "@/lib/engine/types";
import { clientIdAfter, describedBy } from "@/lib/levels/form";
import { MANUAL_STATES, REASON_MAX, REASON_MIN } from "@/lib/skills/types";
import { failText, postJson } from "@/lib/tutorwork/client";

/** "Sửa tay bậc 1–2" (§3 step 5, G3): the child's tutor only (the server and the database check it), always with a reason. */
export function ManualForm({ learnerId, targetKey, current }: { learnerId: string; targetKey: string; current: SkillState }) {
  const router = useRouter();
  const choices = MANUAL_STATES.filter((s) => s !== current);
  const [state, setState] = useState<(typeof MANUAL_STATES)[number]>(choices[0] ?? "SUPPORTED");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [clientId, setClientId] = useState(() => crypto.randomUUID());
  const msgId = `skill-manual-msg-${targetKey}`;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (reason.trim().length < REASON_MIN) return setMsg(skillStateCopy.reasonRequired);
    setBusy(true);
    const r = await postJson(`/api/learners/${learnerId}/skills/manual`, { client_id: clientId, target_key: targetKey, state, reason: reason.trim() });
    setBusy(false);
    setClientId(clientIdAfter(r, clientId));
    if (!r.ok) return setMsg(failText(r));
    setReason("");
    router.refresh();
  }

  return (
    <details className="mt-3 text-sm" data-testid={`skill-manual-${targetKey}`}>
      <summary className="min-h-11 cursor-pointer py-2 text-accent underline">{skillStateCopy.manualOpen}</summary>
      <form onSubmit={save} className="mt-2 flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-muted">{skillStateCopy.manualState}</span>
          <select value={state} onChange={(e) => setState(e.target.value as (typeof MANUAL_STATES)[number])} data-testid="skill-manual-state" className="min-h-11 max-w-60 rounded-lg border border-line bg-white px-2">
            {choices.map((s) => (
              <option key={s} value={s}>
                {levelLabels[s].label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{skillStateCopy.manualReason}</span>
          <textarea
            required
            data-testid="skill-manual-reason"
            value={reason}
            maxLength={REASON_MAX}
            rows={2}
            placeholder={skillStateCopy.manualHint}
            aria-describedby={describedBy(msg && msgId)}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-lg border border-line bg-white px-3 py-2"
          />
        </label>
        {msg ? (
          <p id={msgId} role="alert" className="font-medium text-[#7a2a0c]">
            {msg}
          </p>
        ) : null}
        <button type="submit" disabled={busy} data-testid="skill-manual-save" className="min-h-11 self-start rounded-lg bg-accent px-4 font-semibold text-white disabled:opacity-60">
          {busy ? skillStateCopy.saving : skillStateCopy.manualSave}
        </button>
      </form>
    </details>
  );
}
