"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { teachingNotes } from "@/lib/copy/vi";
import { formatDateVi } from "@/lib/inquiries/format";
import { failText, postJson } from "@/lib/tutorwork/client";
import { NOTE_FIELDS, NOTE_MAX, type TeachingNotesView } from "@/lib/workdesk/types";

/** "Ghi chú dạy học" (W1): 4 fields the tutor keeps about the child; the parent reads. Saving writes one new row per changed field. */
export function TeachingNotesCard({ learnerId, alias, view, canEdit }: { learnerId: string; alias: string; view: TeachingNotesView; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const start = () => {
    setDraft(Object.fromEntries(NOTE_FIELDS.map((f) => [f, view.fields[f]?.text ?? ""])));
    setMsg(null);
    setEditing(true);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const changed = NOTE_FIELDS.filter((f) => (draft[f] ?? "") !== (view.fields[f]?.text ?? ""));
    if (changed.length === 0) return setMsg({ ok: false, text: teachingNotes.nothingChanged });
    setBusy(true);
    setMsg(null);
    for (const f of changed) {
      const r = await postJson(`/api/learners/${learnerId}/teaching-notes`, { field: f, text: draft[f] ?? "", client_id: crypto.randomUUID() });
      if (!r.ok) {
        setBusy(false);
        return setMsg({ ok: false, text: failText(r) });
      }
    }
    setBusy(false);
    setEditing(false);
    setMsg({ ok: true, text: teachingNotes.saved });
    router.refresh();
  }

  return (
    <section className="mt-6 rounded-xl border border-line bg-white p-5" data-testid="teaching-notes">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{teachingNotes.title}</h2>
        {canEdit && !editing ? (
          <button type="button" onClick={start} data-testid="notes-edit" className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm font-medium hover:border-accent">
            {teachingNotes.edit}
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted">{teachingNotes.intro(alias)}</p>
      {editing ? (
        <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2" data-testid="notes-form">
          {NOTE_FIELDS.map((f) => (
            <label key={f} className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{teachingNotes.fields[f]}</span>
              <textarea
                id={`tn_${f}`}
                rows={2}
                maxLength={NOTE_MAX}
                value={draft[f] ?? ""}
                placeholder={teachingNotes.hints[f]}
                onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                className="rounded-lg border border-line bg-white px-3 py-2"
              />
            </label>
          ))}
          <p className="text-xs text-muted sm:col-span-2">{teachingNotes.noPrompt}</p>
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button type="submit" disabled={busy} data-testid="notes-save" className="min-h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? teachingNotes.saving : teachingNotes.save}
            </button>
            <button type="button" disabled={busy} onClick={() => setEditing(false)} className="min-h-11 rounded-xl border border-line bg-white px-5 text-sm font-medium">
              {teachingNotes.cancel}
            </button>
          </div>
        </form>
      ) : (
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {NOTE_FIELDS.map((f) => {
            const e = view.fields[f];
            return (
              <div key={f} data-testid={`note-${f}`}>
                <dt className="text-sm font-medium">{teachingNotes.fields[f]}</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm">{e ? e.text : teachingNotes.empty}</dd>
                {e ? <dd className="text-xs text-muted">{teachingNotes.updated(formatDateVi(e.at), e.authorName)}</dd> : null}
              </div>
            );
          })}
        </dl>
      )}
      {!canEdit ? <p className="mt-3 text-xs text-muted">{teachingNotes.readOnly}</p> : null}
      {msg ? (
        <p role={msg.ok ? "status" : "alert"} data-testid="notes-msg" className={`mt-3 text-sm font-medium ${msg.ok ? "text-accent" : "text-[#7a2a0c]"}`}>
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}
