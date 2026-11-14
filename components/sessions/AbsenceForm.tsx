"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { SaveStatus } from "@/components/ui/SaveStatus";
import { useSaveStatus } from "@/components/ui/useSaveStatus";
import { absenceCopy } from "@/lib/copy/vi";
import { blockImplicitSubmit } from "@/lib/forms/enter";
import { sessionFailText } from "@/lib/sessions/client";
import { dayMonth, liveAbsences } from "@/lib/sessions/count";
import type { AbsenceRow } from "@/lib/sessions/types";
import { absenceLine } from "@/lib/sessions/view";
import { postJson } from "@/lib/tutorwork/client";

const field = "min-h-11 rounded-lg border border-line bg-white px-3";
const seg = (on: boolean) => `min-h-11 rounded-lg border px-3 text-sm font-medium ${on ? "border-accent bg-accent text-white" : "border-line bg-white text-ink hover:border-accent"}`;

/**
 * "Ghi buổi nghỉ" + the list of live absences with "Bỏ ghi nghỉ" (a reason is asked; nothing is deleted). Tutor of the child or parent.
 * The browser sends the facts only (date, who, billable, note): never a count or an amount.
 */
export function AbsenceForm({ learnerId, absences, today, minDate, maxDate }: { learnerId: string; absences: AbsenceRow[]; today: string; minDate: string; maxDate: string }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [by, setBy] = useState<"student" | "tutor" | "other">("student");
  const [billable, setBillable] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const clientId = useRef(crypto.randomUUID());
  const { state, track } = useSaveStatus({ date, by, billable, note });
  const live = liveAbsences(absences).slice().reverse();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (billable === null) return setError(absenceCopy.billableChoose);
    const r = await track(() => postJson(`/api/learners/${learnerId}/sessions/absences`, {
      client_id: clientId.current, absent_on: date, requested_by: by, billable, ...(note.trim() ? { note: note.trim() } : {}),
    }));
    if (!r.ok) return setError(sessionFailText(r));
    clientId.current = crypto.randomUUID();
    setNote("");
    setBillable(null);
    router.refresh();
  }

  return (
    <section aria-labelledby="absence-title" data-testid="absence-box" className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4">
      <h3 id="absence-title" className="text-sm font-semibold">{absenceCopy.listTitle}</h3>
      <form onSubmit={submit} onKeyDown={blockImplicitSubmit} className="flex flex-col gap-3" data-testid="absence-form">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{absenceCopy.date}</span>
          <input type="date" min={minDate} max={maxDate} value={date} onChange={(e) => setDate(e.target.value)} data-testid="absence-date" className={`max-w-56 ${field}`} />
          <span className="text-xs text-muted">{absenceCopy.dateHint}</span>
        </label>
        <div role="radiogroup" aria-label={absenceCopy.by} className="flex flex-col gap-1">
          <span className="text-sm text-muted">{absenceCopy.by}</span>
          <div className="flex flex-wrap gap-2">
            {([["student", absenceCopy.byStudent], ["tutor", absenceCopy.byTutor], ["other", absenceCopy.byOther]] as const).map(([k, text]) => (
              <button key={k} type="button" role="radio" aria-checked={by === k} onClick={() => setBy(k)} data-testid={`absence-by-${k}`} className={seg(by === k)}>{text}</button>
            ))}
          </div>
        </div>
        <div role="radiogroup" aria-label={absenceCopy.billable} className="flex flex-col gap-1">
          <span className="text-sm text-muted">{absenceCopy.billable}</span>
          <div className="flex flex-wrap gap-2">
            {([[true, absenceCopy.billableYes], [false, absenceCopy.billableNo]] as const).map(([k, text]) => (
              <button key={String(k)} type="button" role="radio" aria-checked={billable === k} onClick={() => setBillable(k)} data-testid={`absence-billable-${k ? "yes" : "no"}`} className={seg(billable === k)}>{text}</button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{absenceCopy.note}</span>
          <input type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} data-testid="absence-note" className={field} />
        </label>
        {error ? <p role="alert" className="text-sm text-red-700" data-testid="absence-error">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" data-testid="absence-save" className="min-h-11 rounded-lg bg-accent px-5 text-sm font-bold text-white">{absenceCopy.add}</button>
          <SaveStatus state={state} />
        </div>
      </form>
      {live.length === 0 ? (
        <p className="text-sm text-muted" data-testid="absence-none">{absenceCopy.none}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm" data-testid="absence-list">
          {live.map((a) => (
            <AbsenceItem key={a.id} learnerId={learnerId} a={a} onDone={() => router.refresh()} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AbsenceItem({ learnerId, a, onDone }: { learnerId: string; a: AbsenceRow; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const clientId = useRef(crypto.randomUUID());
  const { state, track } = useSaveStatus({ open, reason });
  async function cancel() {
    setError(null);
    const r = await track(() => postJson(`/api/learners/${learnerId}/sessions/absences/${a.id}/cancel`, { client_id: clientId.current, reason: reason.trim() }));
    if (!r.ok) return setError(sessionFailText(r));
    setOpen(false);
    onDone();
  }
  return (
    <li className="flex flex-col gap-1 border-b border-line py-2" data-testid={`absence-${a.id}`}>
      <span>
        <span className="font-medium">{absenceLine(a)}</span>
        {a.note ? <span className="text-muted"> — {a.note}</span> : null}
        <span className="sr-only"> {dayMonth(a.absentOn)}</span>
      </span>
      {open ? (
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1">
            <span className="text-muted">{absenceCopy.cancelReason}</span>
            <input type="text" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} data-testid={`absence-cancel-reason-${a.id}`} className={field} />
          </label>
          {error ? <p role="alert" className="text-red-700" data-testid={`absence-cancel-error-${a.id}`}>{error}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={cancel} data-testid={`absence-cancel-go-${a.id}`} className="min-h-11 rounded-lg border border-accent bg-white px-4 font-semibold text-accent">{absenceCopy.cancelConfirm}</button>
            <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3 text-muted underline">{absenceCopy.dismiss}</button>
            <SaveStatus state={state} />
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} data-testid={`absence-cancel-${a.id}`} className="inline-flex min-h-11 items-center self-start text-accent underline">{absenceCopy.cancel}</button>
      )}
    </li>
  );
}
