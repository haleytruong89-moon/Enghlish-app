"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { fallbackLabels, reviewPage, supportKindLabels } from "@/lib/copy/vi";
import { SUPPORT_KINDS, SUPPORT_NOTE_MAX } from "@/lib/review/types";

/** Add support the reviewer saw (a separate fact; it never changes a score). */
export function SupportForm({ attemptId, skills, initialOpen = false }: { attemptId: string; skills: { key: string; label: string }[]; initialOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(initialOpen);
  const [kind, setKind] = useState<string>(SUPPORT_KINDS[0]);
  const [picked, setPicked] = useState<string[]>(skills.map((s) => s.key));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const clientId = useRef<string>(crypto.randomUUID());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (picked.length === 0) return setError(reviewPage.supportError);
    if (note.trim().length > SUPPORT_NOTE_MAX) return setError(reviewPage.supportNoteTooLong(SUPPORT_NOTE_MAX));
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/review/attempts/${attemptId}/support`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId.current, kind, target_ids: picked, ...(note.trim() ? { note: note.trim() } : {}) }),
      });
      if (res.status === 403) return setError(reviewPage.tutorOnlyDenied);
      if (res.status === 400 && ((await res.json().catch(() => null)) as { error?: string } | null)?.error === "note_too_long") {
        return setError(reviewPage.supportNoteTooLong(SUPPORT_NOTE_MAX));
      }
      if (!res.ok) throw new Error(String(res.status));
      clientId.current = crypto.randomUUID();
      setNote("");
      setOpen(false);
      setDone(true);
      router.refresh();
    } catch {
      setError(reviewPage.supportError);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          data-testid="support-open"
          onClick={() => setOpen(true)}
          className="min-h-11 self-start rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent"
        >
          {reviewPage.supportAdd}
        </button>
        {done ? (
          <p role="status" className="text-sm text-accent">
            {reviewPage.supportSaved}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-line bg-white p-3" data-testid="support-form">
      <div className="flex flex-col gap-1">
        <label htmlFor="support-kind" className="text-sm text-muted">
          {reviewPage.supportKind}
        </label>
        <select id="support-kind" value={kind} onChange={(e) => setKind(e.target.value)} className="min-h-11 rounded-lg border border-line px-3">
          {SUPPORT_KINDS.map((k) => (
            <option key={k} value={k}>
              {supportKindLabels[k] ?? fallbackLabels.supportKind}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm text-muted">{reviewPage.supportSkills}</legend>
        {skills.map((s) => (
          <label key={s.key} className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={picked.includes(s.key)}
              onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.key] : p.filter((k) => k !== s.key)))}
            />
            {s.label}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor="support-note" className="text-sm text-muted">
          {reviewPage.supportNote}
        </label>
        <input
          id="support-note"
          type="text"
          maxLength={SUPPORT_NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-describedby="support-note-count"
          className="min-h-11 rounded-lg border border-line px-3"
        />
        <span id="support-note-count" className="text-xs text-muted">
          {reviewPage.supportNoteCount(note.length, SUPPORT_NOTE_MAX)}
        </span>
      </div>
      <p className="text-xs text-muted">{reviewPage.supportSeparate}</p>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} data-testid="support-save" className="min-h-11 rounded-lg bg-accent px-5 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? reviewPage.saving : reviewPage.modifySave}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm font-medium">
          {reviewPage.cancel}
        </button>
      </div>
    </form>
  );
}
