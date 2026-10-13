"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { notesPage } from "@/lib/copy/vi";
import { SUPPORT_LEVELS, type LessonNoteView, type SupportLevel } from "@/lib/review/types";

/**
 * Write or edit a lesson note (tutor only; the database re-checks). An edit is saved as a NEW version that points at the old
 * one; skills already logged as practised stay logged. At most 3 next actions.
 */
export function LessonNoteForm({
  learnerId,
  targets,
  today,
  minDate,
  editing,
  onDone,
}: {
  learnerId: string;
  targets: { id: string; title: string }[];
  today: string;
  minDate: string;
  editing: LessonNoteView | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState(editing?.sessionDate ?? today);
  const [goals, setGoals] = useState(editing?.goals ?? "");
  const [observed, setObserved] = useState(editing?.observed ?? "");
  const [level, setLevel] = useState<SupportLevel>(editing?.supportLevel ?? "light");
  const [actions, setActions] = useState<string[]>([0, 1, 2].map((i) => editing?.nextActions[i] ?? ""));
  const [practised, setPracticed] = useState<string[]>(editing?.practisedTargetIds ?? []);
  const [published, setPublished] = useState(editing?.published ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const clientId = useRef<string>(crypto.randomUUID());
  const locked = new Set(editing?.practisedTargetIds ?? []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const nextActions = actions.map((a) => a.trim()).filter(Boolean);
    if (!goals.trim() && !observed.trim() && nextActions.length === 0) return setError(notesPage.empty);
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/learners/${learnerId}/lesson-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId.current,
          session_date: date,
          ...(goals.trim() ? { goals: goals.trim() } : {}),
          ...(observed.trim() ? { observed: observed.trim() } : {}),
          support_level: level,
          next_actions: nextActions,
          practised_target_ids: practised,
          published,
          ...(editing ? { supersedes_id: editing.id } : {}),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      clientId.current = crypto.randomUUID();
      setSaved(true);
      if (!editing) {
        setGoals("");
        setObserved("");
        setActions(["", "", ""]);
        setPracticed([]);
        setPublished(false);
      }
      router.refresh();
      onDone();
    } catch {
      setError(notesPage.error);
    } finally {
      setBusy(false);
    }
  }

  const input = "min-h-11 rounded-lg border border-line px-3";
  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border border-line bg-white p-4" data-testid="note-form">
      <h2 className="text-lg font-semibold">{editing ? notesPage.editTitle : notesPage.newTitle}</h2>

      <div className="flex flex-col gap-1">
        <label htmlFor="note-date" className="text-sm text-muted">
          {notesPage.date}
        </label>
        <input id="note-date" type="date" min={minDate} max={today} value={date} onChange={(e) => setDate(e.target.value)} className={input} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="note-goals" className="text-sm text-muted">
          {notesPage.goals}
        </label>
        <textarea id="note-goals" data-testid="note-goals" rows={2} maxLength={1000} value={goals} onChange={(e) => setGoals(e.target.value)} className="rounded-lg border border-line px-3 py-2" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="note-observed" className="text-sm text-muted">
          {notesPage.observed}
        </label>
        <textarea id="note-observed" data-testid="note-observed" rows={3} maxLength={2000} value={observed} onChange={(e) => setObserved(e.target.value)} className="rounded-lg border border-line px-3 py-2" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="note-level" className="text-sm text-muted">
          {notesPage.supportLevel}
        </label>
        <select id="note-level" value={level} onChange={(e) => setLevel(e.target.value as SupportLevel)} className={input}>
          {SUPPORT_LEVELS.map((l) => (
            <option key={l} value={l}>
              {notesPage.supportLevels[l]}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm text-muted">{notesPage.nextActions}</legend>
        {actions.map((a, i) => (
          <input
            key={i}
            type="text"
            aria-label={notesPage.nextAction(i + 1)}
            data-testid={`note-action-${i + 1}`}
            maxLength={200}
            value={a}
            onChange={(e) => setActions((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
            className={input}
          />
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm text-muted">{notesPage.practised}</legend>
        {targets.length === 0 ? <p className="text-sm text-muted">{notesPage.noTargets}</p> : null}
        {targets.map((t) => (
          <label key={t.id} className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              data-testid={`note-practised-${t.id}`}
              checked={practised.includes(t.id)}
              disabled={locked.has(t.id)}
              onChange={(e) => setPracticed((cur) => (e.target.checked ? [...cur, t.id] : cur.filter((k) => k !== t.id)))}
            />
            {t.title}
          </label>
        ))}
        {editing && locked.size > 0 ? <p className="text-xs text-muted">{notesPage.practisedLocked}</p> : null}
      </fieldset>

      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" data-testid="note-published" checked={published} onChange={(e) => setPublished(e.target.checked)} />
        {notesPage.published}
      </label>

      {error ? (
        <p role="alert" className="text-sm text-red-700" data-testid="note-error">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-sm font-semibold text-accent" data-testid="note-saved">
          {notesPage.saved}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} data-testid="note-save" className="min-h-12 rounded-xl bg-accent px-6 text-base font-bold text-white disabled:opacity-60">
          {busy ? notesPage.saving : notesPage.save}
        </button>
        {editing ? (
          <button type="button" onClick={onDone} className="min-h-12 rounded-xl border border-line bg-white px-5 text-sm font-medium">
            {notesPage.cancel}
          </button>
        ) : null}
      </div>
    </form>
  );
}
