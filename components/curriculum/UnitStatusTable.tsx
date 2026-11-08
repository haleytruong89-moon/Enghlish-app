"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { curriculumCopy } from "@/lib/copy/vi";
import { curriculumErrorText, sendJson } from "@/lib/curriculum/client";
import type { CardUnit } from "@/lib/curriculum/shape";
import { UNIT_STATUSES, type UnitStatus } from "@/lib/curriculum/types";

/** Unit statuses of the version in use: one row per unit, 4 buttons. Each click = one new event (old events stay; DOMAIN §8). */
export function UnitStatusTable({ curriculumId, units, statusOf }: { curriculumId: string; units: CardUnit[]; statusOf: Record<string, UnitStatus> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function set(code: string, status: UnitStatus) {
    setBusy(code);
    setMsg(null);
    const r = await sendJson(`/api/curricula/${curriculumId}/unit-events`, "POST", { unit_code: code, status, lesson_note_id: null, client_id: crypto.randomUUID() });
    setBusy(null);
    if (!r.ok) return setMsg({ ok: false, text: curriculumErrorText(r.error) });
    setMsg({ ok: true, text: curriculumCopy.unitStatusSaved(code, curriculumCopy.unitStatus[status]) });
    router.refresh();
  }
  return (
    <div className="mt-4 flex flex-col gap-2" data-testid="unit-status-table">
      {msg ? (
        <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-accent" : "text-[#8A1C12]"}`}>
          {msg.text}
        </p>
      ) : null}
      {units.map((u) => (
        <div key={u.code} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-4 py-2" data-testid={`unit-${u.code}`}>
          <span className="min-w-0 flex-1 text-[15px]">
            <b>{u.code}</b> · {u.title}
            {u.skipped ? <span className="ml-2 rounded-full bg-line px-2 py-0.5 text-xs">{curriculumCopy.skippedBadge}</span> : null}
          </span>
          <div className="flex flex-wrap gap-1" role="group" aria-label={`${u.code} · ${u.title}`}>
            {UNIT_STATUSES.map((s) => (
              <button key={s} type="button" disabled={busy !== null} aria-pressed={statusOf[u.code] === s} onClick={() => void set(u.code, s)} data-testid={`unit-${u.code}-${s}`}
                className={`min-h-11 rounded-lg border px-3 text-sm ${statusOf[u.code] === s ? "border-accent bg-accent font-semibold text-white" : "border-line bg-white"}`}>
                {curriculumCopy.unitStatus[s]}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
