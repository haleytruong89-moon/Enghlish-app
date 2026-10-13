"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { inquiriesPage } from "@/lib/copy/vi";

type Kind = "reschedule" | "skip" | "unskip";

/**
 * "Đổi ngày" / "Bỏ bước" / "Làm lại bước" for one step. A reason is mandatory — checked here for a
 * friendly message and again by the API and the database.
 */
export function StepActions({
  activityId,
  skipped,
  currentDate,
}: {
  activityId: string;
  skipped: boolean;
  currentDate: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Kind | null>(null);
  const [date, setDate] = useState(currentDate ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `${activityId}`;

  function close() {
    setOpen(null);
    setReason("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!open) return;
    if (reason.trim().length < 3) return setError(inquiriesPage.reasonRequired);
    if (open === "reschedule" && !date) return setError(inquiriesPage.dateRequired);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/activities/${activityId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: open, ...(open === "reschedule" ? { new_date: date } : {}), reason: reason.trim() }),
      });
      if (!res.ok) throw new Error(String(res.status));
      close();
      router.refresh();
    } catch {
      setError(inquiriesPage.eventError);
    } finally {
      setBusy(false);
    }
  }

  const btn = "min-h-11 rounded-lg border border-line bg-white px-4 text-sm font-medium hover:border-accent";

  return (
    <div className="mt-2">
      {open === null ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => setOpen("reschedule")}>
            {inquiriesPage.reschedule}
          </button>
          <button type="button" className={btn} onClick={() => setOpen(skipped ? "unskip" : "skip")}>
            {skipped ? inquiriesPage.unskip : inquiriesPage.skip}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-line bg-white p-3">
          <p className="text-sm font-semibold">
            {open === "reschedule" ? inquiriesPage.reschedule : open === "skip" ? inquiriesPage.skip : inquiriesPage.unskip}
          </p>
          {open === "reschedule" ? (
            <div className="flex flex-col gap-1">
              <label htmlFor={`date-${base}`} className="text-sm text-muted">
                {inquiriesPage.newDate}
              </label>
              <input
                id={`date-${base}`}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="min-h-11 rounded-lg border border-line px-3"
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <label htmlFor={`reason-${base}`} className="text-sm text-muted">
              {inquiriesPage.reasonLabel}
            </label>
            <input
              id={`reason-${base}`}
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
            <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-accent px-5 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? inquiriesPage.saving : inquiriesPage.save}
            </button>
            <button type="button" className={btn} onClick={close}>
              {inquiriesPage.cancel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
