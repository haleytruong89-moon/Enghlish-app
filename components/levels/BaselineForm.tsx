"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { levelCopy, levelFormCopy } from "@/lib/copy/vi";
import { clientIdAfter, describedBy } from "@/lib/levels/form";
import { levelsOf } from "@/lib/levels/scale";
import { REASON_MAX, type Scale } from "@/lib/levels/types";
import type { DomainKey } from "@/lib/skillmap/types";
import { failText, postJson } from "@/lib/tutorwork/client";

export type BaselineRow = { key: DomainKey; name: string; scale: Scale; assumed: string };

/** "Xác nhận cấp khởi điểm" (D6): every not-yet-confirmed domain prefilled with its assumed level, one optional note, one save. Tutor only. */
export function BaselineForm({ learnerId, rows }: { learnerId: string; rows: BaselineRow[] }) {
  const router = useRouter();
  const [levels, setLevels] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.key, r.assumed])));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // One client id per screen: a retry after a lost answer is recognised as the same save (replayed).
  const [clientId, setClientId] = useState(() => crypto.randomUUID());

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    const r = await postJson(`/api/learners/${learnerId}/levels`, {
      client_id: clientId,
      kind: "baseline",
      levels,
      ...(note.trim() ? { reason: note.trim() } : {}),
    });
    setBusy(false);
    // After a 409 (e.g. a domain was confirmed meanwhile) the next try must be a new save, not the same client id again.
    setClientId(clientIdAfter(r, clientId));
    if (!r.ok) return setMsg({ ok: false, text: failText(r) });
    setMsg({ ok: true, text: levelFormCopy.saved });
    router.push(`/learners/${learnerId}/levels`);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="mt-6 flex flex-col gap-4" data-testid="baseline-form">
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3">
            <span className="flex min-w-0 flex-col">
              <b className="font-semibold">{r.name}</b>
              <span id={`baseline-${r.key}-hint`} className="text-xs text-muted">{levelFormCopy.assumedHint(levelCopy.levelName(r.scale, r.assumed))}</span>
            </span>
            <select
              aria-label={levelFormCopy.levelOf(r.name)}
              value={levels[r.key] ?? r.assumed}
              onChange={(e) => setLevels({ ...levels, [r.key]: e.target.value })}
              data-testid={`baseline-${r.key}`}
              aria-describedby={describedBy(`baseline-${r.key}-hint`, msg && !msg.ok && "baseline-msg")}
              className="min-h-11 rounded-lg border border-line bg-white px-2"
            >
              {levelsOf(r.scale).map((l) => (
                <option key={l} value={l}>
                  {levelCopy.levelName(r.scale, l)}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{levelFormCopy.note}</span>
        <textarea
          value={note}
          maxLength={REASON_MAX}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
          data-testid="baseline-note"
          aria-describedby={describedBy(msg && !msg.ok && "baseline-msg")}
          className="rounded-lg border border-line bg-white px-3 py-2"
        />
      </label>
      {msg ? (
        <p id="baseline-msg" role="status" data-testid="baseline-msg" className={msg.ok ? "text-accent" : "font-medium text-[#7a2a0c]"}>
          {msg.text}
        </p>
      ) : null}
      <button type="submit" disabled={busy} data-testid="baseline-save" aria-describedby={describedBy(msg && "baseline-msg")} className="min-h-12 rounded-xl bg-accent px-5 text-base font-semibold text-white disabled:opacity-60">
        {busy ? levelFormCopy.saving : levelFormCopy.saveBaseline}
      </button>
    </form>
  );
}
