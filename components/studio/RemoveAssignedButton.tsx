"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { studioAssignedCopy as c } from "@/lib/copy/vi";

/** The API caps a reason at 500 characters; the form keeps it shorter. */
const REASON_MAX = 300;

/**
 * "Gỡ bài" for a Studio test the child has not sent = the step event `skip` (0007): the step leaves the child's Hôm nay and the
 * overdue counts. "Khôi phục" = `unskip`. The reason is checked here for a friendly message and again by the API and the database.
 * The server refuses to skip a step with sent work (409 has_work); 400 / 409 mean the page is stale: it is reloaded.
 */
export function RemoveAssignedButton({ activityId, removed, title }: { activityId: string; removed: boolean; title: string }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  // "sent" stays true until the refreshed page replaces this row: no second click can send a duplicate event in between.
  const [busy, setBusy] = useState<"idle" | "sending" | "sent">("idle");

  async function send(kind: "skip" | "unskip", why: string) {
    setBusy("sending");
    setError(null);
    try {
      const res = await fetch(`/api/activities/${activityId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, reason: why }),
      });
      if (res.status === 400 || res.status === 409) {
        setBusy("idle");
        setError(c.stale);
        router.refresh();
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setBusy("sent");
      router.refresh();
    } catch {
      setBusy("idle");
      setError(c.failed);
    }
  }

  const btn = "min-h-11 rounded-lg border px-4 text-sm font-semibold disabled:opacity-60";
  const disabled = busy !== "idle";
  if (removed) {
    return (
      <div className="flex flex-col gap-1">
        <button type="button" disabled={disabled} onClick={() => void send("unskip", c.restoreReason)} className={`${btn} border-accent bg-white text-accent`} data-testid={`restore-${activityId}`}>
          {disabled ? c.saving : c.restore}
        </button>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      </div>
    );
  }
  if (!open) {
    return (
      <div className="flex flex-col gap-1">
        <button type="button" disabled={disabled} onClick={() => setOpen(true)} className={`${btn} border-[#b9582a] bg-white text-[#8a3a12]`} data-testid={`remove-${activityId}`}>
          {c.remove}
        </button>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      </div>
    );
  }
  return (
    <form
      className="flex w-full flex-col gap-2 border-t border-line pt-3"
      aria-labelledby={`${id}-title`}
      data-testid={`remove-form-${activityId}`}
      onSubmit={(e) => {
        e.preventDefault();
        const why = reason.trim();
        if (why.length < 3) return setError(c.reasonRequired);
        void send("skip", why);
      }}
    >
      <p id={`${id}-title`} className="text-sm font-semibold">
        {c.removeTitle(title)}
      </p>
      <p className="text-sm text-muted">{c.removeHelp}</p>
      <label htmlFor={`${id}-reason`} className="text-sm font-semibold">
        {c.reasonLabel}
      </label>
      <input
        id={`${id}-reason`}
        type="text"
        value={reason}
        maxLength={REASON_MAX}
        placeholder={c.reasonPlaceholder}
        autoFocus
        onChange={(e) => {
          setReason(e.target.value);
          setError(null);
        }}
        className="min-h-11 rounded-lg border border-line px-3"
      />
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={disabled} className={`${btn} border-[#8a3a12] bg-[#8a3a12] text-white`}>
          {disabled ? c.saving : c.confirmRemove}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className={`${btn} border-line bg-white`}
        >
          {c.cancel}
        </button>
      </div>
    </form>
  );
}
