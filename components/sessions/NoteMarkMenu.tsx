"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { SaveStatus } from "@/components/ui/SaveStatus";
import { useSaveStatus } from "@/components/ui/useSaveStatus";
import { sessionKindCopy } from "@/lib/copy/vi";
import { sessionFailText } from "@/lib/sessions/client";
import { postJson } from "@/lib/tutorwork/client";

type Kind = "regular" | "makeup" | "not_counted";
const field = "min-h-11 rounded-lg border border-line bg-white px-3";
const seg = (on: boolean) => `min-h-11 rounded-lg border px-3 text-sm font-medium ${on ? "border-accent bg-accent text-white" : "border-line bg-white text-ink hover:border-accent"}`;
const KIND_TEXT: Record<Kind, string> = { regular: sessionKindCopy.regular, makeup: sessionKindCopy.makeup, not_counted: sessionKindCopy.notCounted };

/** "Đánh dấu" on one current lesson note: Thường · Học bù (+ the absence it makes up) · Không tính (a reason is required). The newest mark wins. */
export function NoteMarkMenu({
  learnerId, noteId, current, makeupChoices, parentNote,
}: { learnerId: string; noteId: string; current: Kind; makeupChoices: { id: string; label: string }[]; parentNote: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>(current);
  const [makeupFor, setMakeupFor] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const clientId = useRef(crypto.randomUUID());
  const { state, track } = useSaveStatus({ open, kind, makeupFor, reason });

  async function save() {
    setError(null);
    if (kind === "not_counted" && reason.trim().length < 5) return setError(sessionKindCopy.reasonNeeded);
    const r = await track(() => postJson(`/api/learners/${learnerId}/sessions/marks`, {
      client_id: clientId.current, note_id: noteId, kind,
      ...(kind === "makeup" && makeupFor ? { makeup_for: makeupFor } : {}),
      ...(kind === "not_counted" ? { reason: reason.trim() } : {}),
    }));
    if (!r.ok) return setError(sessionFailText(r));
    clientId.current = crypto.randomUUID();
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => { setKind(current); setOpen(true); }} data-testid={`note-mark-${noteId}`} className="mt-2 min-h-11 rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink">
        {sessionKindCopy.mark}
        <span className="sr-only">: {KIND_TEXT[current]}</span>
      </button>
    );
  }
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-line p-3" data-testid={`note-mark-box-${noteId}`}>
      <div role="radiogroup" aria-label={sessionKindCopy.label} className="flex flex-wrap gap-2">
        {(["regular", "makeup", "not_counted"] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} data-testid={`note-mark-kind-${k}`} className={seg(kind === k)}>{KIND_TEXT[k]}</button>
        ))}
      </div>
      {parentNote ? <p className="text-xs text-muted">{sessionKindCopy.parentNoteHint}</p> : null}
      {kind === "makeup" && makeupChoices.length > 0 ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{sessionKindCopy.makeupFor}</span>
          <select value={makeupFor} onChange={(e) => setMakeupFor(e.target.value)} data-testid="note-mark-makeup-for" className={`max-w-72 ${field}`}>
            <option value="">{sessionKindCopy.makeupForNone}</option>
            {makeupChoices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
      ) : null}
      {kind === "not_counted" ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{sessionKindCopy.reason}</span>
          <input type="text" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="note-mark-reason" className={field} />
        </label>
      ) : null}
      {error ? <p role="alert" className="text-sm text-red-700" data-testid="note-mark-error">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} data-testid="note-mark-save" className="min-h-11 rounded-lg bg-accent px-5 text-sm font-bold text-white">{sessionKindCopy.save}</button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3 text-sm text-muted underline">{sessionKindCopy.cancel}</button>
        <SaveStatus state={state} />
      </div>
    </div>
  );
}
