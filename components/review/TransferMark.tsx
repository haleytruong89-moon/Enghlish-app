"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reviewPage } from "@/lib/copy/vi";

/** G4 (S7a): the reviewer ticks that this work is on a new topic / source, so it counts as transfer ("vận dụng"). Shown only to someone who may decide. */
export function TransferMark({ episodeId, initial }: { episodeId: string; initial: boolean }) {
  const router = useRouter();
  const [checked, setChecked] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function toggle(next: boolean) {
    // Optimistic: the box follows the click at once (a controlled checkbox that waits for the server looks broken),
    // and goes back if the server refuses.
    setChecked(next);
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/review/episodes/${episodeId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: next }),
      });
      if (res.status === 403) {
        setChecked(!next);
        return setMsg({ ok: false, text: reviewPage.tutorOnlyDenied });
      }
      if (!res.ok) throw new Error(String(res.status));
      setMsg({ ok: true, text: reviewPage.transferMarkSaved });
      router.refresh();
    } catch {
      setChecked(!next);
      setMsg({ ok: false, text: reviewPage.transferMarkError });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-white p-3" data-testid="transfer-mark">
      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
        <input
          type="checkbox"
          data-testid="transfer-mark-input"
          className="h-5 w-5"
          checked={checked}
          disabled={busy}
          onChange={(e) => void toggle(e.target.checked)}
        />
        {reviewPage.transferMark}
      </label>
      <p className="text-xs text-muted">{reviewPage.transferMarkHint}</p>
      {msg ? (
        <p role={msg.ok ? "status" : "alert"} data-testid="transfer-mark-msg" className={msg.ok ? "text-sm text-accent" : "text-sm text-[#8A2D1B]"}>
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
