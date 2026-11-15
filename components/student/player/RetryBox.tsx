"use client";

import { useRef, useState } from "react";
import { retryCopy as c } from "@/lib/copy/vi";

/** "Thử lại câu này": one retry per item. It goes to the tutor, never marked here, and the child is never told whether it is right. */
export function RetryBox({ activityId, itemId, number, options, long, onSent }: { activityId: string; itemId: string; number: number; /** Choices of a multiple-choice item (radios); empty = free text. */ options: string[]; /** An open / transform item: a larger box and limit. */ long: boolean; onSent: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const clientId = useRef<string>(crypto.randomUUID());

  async function send() {
    const answer = text.trim();
    if (!answer || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/student/activities/${activityId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, answer, client_id: clientId.current }),
      });
      if (res.status === 409) {
        // Already retried (another tab, a lost reply): show what is stored as sent instead of an error.
        const stored = await fetch(`/api/student/activities/${activityId}/result`, { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .then((x: { result?: { look?: { id: string; retry: { text: string } | null }[] } } | null) => x?.result?.look?.find((l) => l.id === itemId)?.retry?.text ?? null)
          .catch(() => null);
        if (stored) return onSent(stored);
        return setProblem(c.refused);
      }
      if (!res.ok) throw new Error(String(res.status));
      onSent(answer);
    } catch {
      setProblem(c.failed);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" data-testid={`retry-open-${itemId}`} onClick={() => setOpen(true)} className="min-h-11 self-start rounded-xl border border-line bg-[#E3ECE8] px-4 text-sm font-semibold text-[#1F4439]">
        {c.open}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2" data-testid={`retry-box-${itemId}`}>
      <label className="sr-only" htmlFor={options.length > 0 ? undefined : `retry-${itemId}`}>
        {c.inputLabel(number)}
      </label>
      {options.length > 0 ? (
        <div role="radiogroup" aria-label={c.inputLabel(number)} className="flex flex-col gap-2">
          {options.map((o) => (
            <label key={o} className="flex min-h-12 items-center gap-3 rounded-xl border border-line px-3.5 text-[16px] has-[:checked]:border-accent has-[:checked]:bg-[#E3ECE8]">
              <input type="radio" name={`retry-${itemId}`} value={o} checked={text === o} onChange={() => setText(o)} className="h-5 w-5 accent-[#2B5D4F]" />
              <span lang="en">{o}</span>
            </label>
          ))}
        </div>
      ) : long ? (
        <textarea
          id={`retry-${itemId}`}
          lang="en"
          rows={6}
          value={text}
          maxLength={2000}
          placeholder={c.placeholder}
          onChange={(e) => setText(e.target.value)}
          className="min-h-12 rounded-xl border border-line bg-white px-3 py-2 text-[16px]"
        />
      ) : (
        <input
          id={`retry-${itemId}`}
          type="text"
          lang="en"
          value={text}
          maxLength={500}
          placeholder={c.placeholder}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          className="min-h-12 rounded-xl border border-line bg-white px-3 text-[16px]"
        />
      )}
      {problem ? (
        <p role="alert" className="text-sm text-[#6B4600]" data-testid="retry-problem">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || text.trim() === ""} onClick={() => void send()} data-testid={`retry-send-${itemId}`} className="min-h-12 rounded-xl bg-accent px-5 text-base font-bold text-white disabled:opacity-60">
          {busy ? c.sending : c.send}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-12 rounded-xl border border-line bg-white px-5 text-base font-semibold">
          {c.later}
        </button>
      </div>
    </div>
  );
}
