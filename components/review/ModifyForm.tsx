"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { formatScore, reviewPage } from "@/lib/copy/vi";
import { choiceToScore, ScoreButtons, type Choice } from "./ScoreButtons";

/** "Sửa quyết định": a new decision with a mandatory reason; the old one stays in the history. */
export function ModifyForm({
  decisionId,
  skill,
  testKey,
  currentScore,
  currentNotObserved,
}: {
  decisionId: string;
  skill: string;
  testKey: string;
  currentScore: number | null;
  currentNotObserved: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Choice | undefined>(undefined);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clientId = useRef<string>(crypto.randomUUID());

  const current: Choice = currentNotObserved ? "na" : ((currentScore ?? 0) as Choice);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (choice === undefined) return setError(reviewPage.modifyPickRequired);
    if (choice === current) return setError(reviewPage.modifySame);
    if (reason.trim().length < 3) return setError(reviewPage.modifyReasonRequired);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/review/decisions/${decisionId}/modify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId.current, ...choiceToScore(choice), reason: reason.trim() }),
      });
      if (res.status === 409) {
        router.refresh();
        return setError(reviewPage.saveConflict);
      }
      if (res.status === 403) return setError(reviewPage.tutorOnlyDenied);
      if (!res.ok) throw new Error(String(res.status));
      clientId.current = crypto.randomUUID();
      setOpen(false);
      setReason("");
      setChoice(undefined);
      router.refresh();
    } catch {
      setError(reviewPage.saveError);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        data-testid={`modify-open-${testKey}`}
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent"
      >
        {reviewPage.modify}
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-line bg-white p-3" data-testid={`modify-form-${testKey}`}>
      <p className="text-sm">
        {reviewPage.currentDecision(formatScore(currentNotObserved ? null : (currentScore as 0 | 1 | 2 | 3 | 4)))}
      </p>
      <ScoreButtons label={skill} testKey={`${testKey}-new`} value={choice} onChange={setChoice} />
      <div className="flex flex-col gap-1">
        <label htmlFor={`reason-${testKey}`} className="text-sm text-muted">
          {reviewPage.modifyReason}
        </label>
        <input
          id={`reason-${testKey}`}
          data-testid={`modify-reason-${testKey}`}
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="min-h-11 rounded-lg border border-line px-3"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          data-testid={`modify-save-${testKey}`}
          className="min-h-11 rounded-lg bg-accent px-5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? reviewPage.saving : reviewPage.modifySave}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm font-medium">
          {reviewPage.cancel}
        </button>
      </div>
    </form>
  );
}
