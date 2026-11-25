"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { REASON_MAX, REASON_MIN } from "@/lib/actioncards/schemas";
import { resultsCopy } from "@/lib/copy/vi";
import type { DecidableKind } from "@/lib/results/actions";
import { clientIdBook } from "@/lib/roadmap/clientId";
import { postJson } from "@/lib/tutorwork/client";

const c = resultsCopy.decide;

/**
 * "Đã làm" / "Bỏ qua" under one "Việc nên làm" card (the tutor). "Bỏ qua" asks for a short reason first. Once saved the page refreshes and
 * the card leaves the list until newer work feeds it. The same click sent twice is one row (client id), so a double tap is harmless.
 */
export function CardDecision({ learnerId, cardKey, kind, label, evidenceAt }: { learnerId: string; cardKey: string; kind: DecidableKind; label: string; evidenceAt: string }) {
  const router = useRouter();
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const book = useRef(clientIdBook());
  const trimmed = reason.trim();
  const reasonOk = trimmed.length >= REASON_MIN && trimmed.length <= REASON_MAX;

  async function send(decision: "done" | "skipped") {
    if (busy || (decision === "skipped" && !reasonOk)) return;
    setBusy(true);
    setMsg(null);
    const body = { card_key: cardKey, kind, label: label.slice(0, 300), evidence_at: evidenceAt || null, decision, reason: decision === "skipped" ? trimmed : null };
    const r = await postJson(`/api/learners/${learnerId}/action-cards`, { ...body, client_id: book.current.idFor(body) });
    book.current.settle({ ok: r.ok, status: r.status });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.status === 0 ? c.errors.offline! : (c.errors[r.error] ?? c.errors.generic!) });
    setMsg({ ok: true, text: decision === "done" ? c.doneSaved : c.skipSaved });
    router.refresh();
  }

  return (
    <div className="flex w-full flex-col gap-2" data-testid={`card-decision-${cardKey}`}>
      {skipping ? (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor={`reason-${cardKey}`}>{c.reasonLabel}</label>
          <input
            id={`reason-${cardKey}`}
            data-testid="card-skip-reason"
            value={reason}
            maxLength={REASON_MAX}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void send("skipped");
              }
            }}
            className="min-h-11 rounded-xl border border-line bg-white px-3 text-sm"
          />
          <p className="text-xs text-muted">{c.reasonHint}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="card-skip-confirm" disabled={busy || !reasonOk} onClick={() => void send("skipped")} className="min-h-11 rounded-xl border border-line bg-white px-4 text-sm font-semibold disabled:opacity-50">
              {busy ? c.busy : c.confirmSkip}
            </button>
            <button type="button" disabled={busy} onClick={() => setSkipping(false)} className="min-h-11 rounded-xl px-4 text-sm text-muted underline">{c.cancel}</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-label={c.groupLabel}>
          <button type="button" data-testid="card-done" disabled={busy} onClick={() => void send("done")} className="min-h-11 rounded-xl border border-line bg-white px-4 text-sm font-semibold disabled:opacity-50">
            {busy ? c.busy : c.done}
          </button>
          <button type="button" data-testid="card-skip" disabled={busy} onClick={() => setSkipping(true)} className="min-h-11 rounded-xl px-4 text-sm text-muted underline">{c.skip}</button>
        </div>
      )}
      {msg ? <p role="status" className={`text-sm ${msg.ok ? "text-[#2f7d4f]" : "text-[#b4402c]"}`}>{msg.text}</p> : null}
    </div>
  );
}
