"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { levelCopy, levelFormCopy } from "@/lib/copy/vi";
import { describedBy, clientIdAfter } from "@/lib/levels/form";
import { levelsOf } from "@/lib/levels/scale";
import { REASON_MAX, type Scale } from "@/lib/levels/types";
import type { DomainKey } from "@/lib/skillmap/types";
import { failText, postJson } from "@/lib/tutorwork/client";

/** "Điều chỉnh cấp" (P2-c, D6): one domain, up or down, reason required; the parent sees it on her home. Tutor only. */
export function AdjustForm({ learnerId, domain }: { learnerId: string; domain: { key: DomainKey; name: string; scale: Scale; current: string } }) {
  const router = useRouter();
  const [level, setLevel] = useState(domain.current);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [clientId, setClientId] = useState(() => crypto.randomUUID());

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (level === domain.current) return setMsg(levelFormCopy.sameLevel);
    if (!reason.trim()) return setMsg(levelFormCopy.reasonRequired);
    setBusy(true);
    const r = await postJson(`/api/learners/${learnerId}/levels`, { client_id: clientId, kind: "adjust", levels: { [domain.key]: level }, reason: reason.trim() });
    setBusy(false);
    // After a 409 the next try must be a new save, not the same client id again.
    setClientId(clientIdAfter(r, clientId));
    if (!r.ok) return setMsg(failText(r));
    router.push(`/learners/${learnerId}/levels?domain=${domain.key}`);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="mt-6 flex flex-col gap-4 rounded-xl border border-line bg-white p-5" data-testid="adjust-form">
      <h2 className="text-lg font-semibold">{domain.name}</h2>
      <p className="text-sm" data-testid="adjust-current">
        {levelFormCopy.current(levelCopy.levelName(domain.scale, domain.current))}
      </p>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{levelFormCopy.newLevel}</span>
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          data-testid="adjust-level"
          aria-describedby={describedBy(msg && "adjust-msg")}
          className="min-h-11 max-w-40 rounded-lg border border-line bg-white px-2">
          {levelsOf(domain.scale).map((l) => (
            <option key={l} value={l}>
              {levelCopy.levelName(domain.scale, l)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{levelFormCopy.reason}</span>
        <span id="adjust-reason-hint" className="text-xs text-muted">
          {levelFormCopy.reasonHint}
        </span>
        <textarea
          required
          data-testid="adjust-reason"
          value={reason}
          maxLength={REASON_MAX}
          rows={3}
          placeholder={levelFormCopy.reasonHint}
          aria-describedby={describedBy("adjust-reason-hint", msg && "adjust-msg")}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-lg border border-line bg-white px-3 py-2"
        />
      </label>
      {msg ? (
        <p id="adjust-msg" role="alert" data-testid="adjust-msg" className="font-medium text-[#7a2a0c]">
          {msg}
        </p>
      ) : null}
      <button type="submit" disabled={busy} data-testid="adjust-save" aria-describedby={describedBy(msg && "adjust-msg")} className="min-h-12 rounded-xl bg-accent px-5 text-base font-semibold text-white disabled:opacity-60">
        {busy ? levelFormCopy.saving : levelFormCopy.saveAdjust}
      </button>
    </form>
  );
}
