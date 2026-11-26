"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { curriculumErrorText, sendJson } from "@/lib/curriculum/client";
import { resultsCopy } from "@/lib/copy/vi";

const c = resultsCopy.cards.unit_ready;

/** L2: "Đánh dấu Đã học" on a "unit_ready" card — one new Unit event (the same call as the Trạng thái Unit page). The tutor only. */
export function UnitDoneButton({ curriculumId, unit }: { curriculumId: string; unit: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const clientId = useRef(crypto.randomUUID());
  async function mark() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const r = await sendJson(`/api/curricula/${curriculumId}/unit-events`, "POST", { unit_code: unit, status: "done", lesson_note_id: null, client_id: clientId.current });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: curriculumErrorText(r.error) });
    setMsg({ ok: true, text: c.marked(unit) });
    router.refresh();
  }
  return (
    <div className="flex flex-col gap-1">
      <button type="button" disabled={busy} onClick={() => void mark()} data-testid={`unit-done-${unit}`} className="min-h-11 self-start rounded-xl border border-accent bg-white px-4 text-sm font-semibold text-accent disabled:opacity-50">
        {busy ? c.marking : c.mark}
      </button>
      {msg ? <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-[#2f7d4f]" : "text-[#b4402c]"}`}>{msg.text}</p> : null}
    </div>
  );
}
