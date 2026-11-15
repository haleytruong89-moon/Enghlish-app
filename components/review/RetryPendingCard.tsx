// components/review/RetryPendingCard.tsx
"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { BusyButton } from "@/components/ui/BusyButton";
import { SaveStatus } from "@/components/ui/SaveStatus";
import { useSaveStatus } from "@/components/ui/useSaveStatus";
import { busyCopy, studioCopy, studioInboxCopy } from "@/lib/copy/vi";
import { clientIdBook } from "@/lib/roadmap/clientId";
import { sendJson } from "@/lib/studio/client";
import type { RetryAttempt } from "@/lib/studio/types";
import { newestAt, studioErrorText } from "@/lib/studio/view";

/**
 * One attempt whose retries nobody has marked "Đã xem": the retry text beside the original answer, an optional note (adult-only: the child
 * does not see it) and the "Đã xem" button. Adults only. The row leaves Chờ duyệt only through this button.
 */
export function RetryPendingCard({ attempt }: { attempt: RetryAttempt }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const book = useRef(clientIdBook());
  const { state, track } = useSaveStatus({ note });

  async function markSeen() {
    setBusy(true);
    setMsg(null);
    // The newest retry this card showed: a retry made after the card was opened is not covered and stays pending.
    const body = { note: note.trim() === "" ? undefined : note.trim(), seen_through: newestAt(attempt.retries.map((r) => r.at)) ?? attempt.since };
    const r = await track(() => sendJson(`/api/review/studio/attempts/${attempt.attemptId}/retry-seen`, "POST", { ...body, client_id: book.current.idFor(body) }));
    book.current.settle(r);
    setBusy(false);
    if (!r.ok) return setMsg(studioErrorText(r.error));
    setDone(true);
    router.refresh();
  }

  if (done) return null;
  return (
    <li id={`retry-${attempt.attemptId}`} data-testid={`retry-card-${attempt.attemptId}`} className="scroll-mt-4 rounded-2xl border border-line bg-white p-5">
      <h3 className="text-lg font-semibold">{studioInboxCopy.retryHeading(attempt.alias, attempt.title, attempt.retries.length)}</h3>
      <ul className="mt-3 flex flex-col gap-3">
        {attempt.retries.map((r) => (
          <li key={r.itemId} className="flex flex-col gap-1 rounded-xl border border-line p-3" data-testid={`retry-item-${attempt.attemptId}-${r.itemId}`}>
            <p className="font-semibold">{studioCopy.itemLabel(r.n)}. <span lang="en" className="font-normal">{r.stem}</span></p>
            <p className="text-sm">{studioInboxCopy.retryFirst}: <span lang="en" className="font-semibold" data-testid="retry-given">{r.given || studioInboxCopy.blankAnswer}</span></p>
            {r.retry === null ? (
              <p className="text-sm font-semibold" data-testid="retry-revealed">{studioInboxCopy.retryRevealed}</p>
            ) : (
              <p className="text-sm">{studioInboxCopy.retryNow}: <span lang="en" className="font-semibold" data-testid="retry-text">{r.retry}</span></p>
            )}
          </li>
        ))}
      </ul>
      <label className="mt-3 flex flex-col text-xs font-semibold">
        {studioInboxCopy.retryNoteLabel}
        <textarea data-testid={`retry-note-${attempt.attemptId}`} rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 rounded-lg border border-line px-3 py-2 text-sm font-normal" />
        <span className="mt-1 font-normal text-muted">{studioInboxCopy.retryNoteHint}</span>
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <BusyButton busy={busy} busyLabel={busyCopy.saving} type="button" onClick={() => void markSeen()} data-testid={`retry-seen-${attempt.attemptId}`} className="min-h-11 rounded-xl bg-accent px-5 font-bold text-white">
          {studioInboxCopy.retrySeen}
        </BusyButton>
        <SaveStatus state={state} />
      </div>
      {msg ? <p role="alert" className="mt-2 text-sm text-[#8A1C12]">{msg}</p> : null}
    </li>
  );
}
