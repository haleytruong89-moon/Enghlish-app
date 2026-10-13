"use client";

import { useState } from "react";
import { notesPage } from "@/lib/copy/vi";
import { formatDateVi } from "@/lib/inquiries/format";
import type { LessonNoteView } from "@/lib/review/types";
import { LessonNoteForm } from "./LessonNoteForm";

/** The list of notes (newest first) with the form for the tutor. Parents get the list only (published, current notes). */
export function LessonNotes({
  learnerId,
  notes,
  targets,
  canWrite,
  today,
  minDate,
}: {
  learnerId: string;
  notes: LessonNoteView[];
  targets: { id: string; title: string }[];
  canWrite: boolean;
  today: string;
  minDate: string;
}) {
  const [editing, setEditing] = useState<LessonNoteView | null>(null);
  const titleOf = new Map(targets.map((t) => [t.id, t.title]));
  const current = notes.filter((n) => n.current);
  const older = notes.filter((n) => !n.current);

  return (
    <div className="mt-6 flex flex-col gap-6">
      {canWrite ? (
        <LessonNoteForm key={editing?.id ?? "new"} learnerId={learnerId} targets={targets} today={today} minDate={minDate} editing={editing} onDone={() => setEditing(null)} />
      ) : null}

      {current.length === 0 ? (
        <p className="rounded-xl border border-line bg-white px-5 py-4" data-testid="notes-empty">
          {canWrite ? notesPage.emptyTutor : notesPage.emptyParent}
        </p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="notes-list">
          {current.map((n) => (
            <li key={n.id} className="rounded-xl border border-line bg-white px-5 py-4" data-testid={`note-${n.id}`}>
              <p className="font-semibold">
                {formatDateVi(n.sessionDate)} · {notesPage.supportLevels[n.supportLevel]}
                <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs font-normal">{n.published ? notesPage.sharedTag : notesPage.privateTag}</span>
              </p>
              {n.goals ? <p className="mt-2 text-sm">{n.goals}</p> : null}
              {n.observed ? <p className="mt-1 text-sm text-muted">{n.observed}</p> : null}
              {n.nextActions.length > 0 ? (
                <div className="mt-2">
                  <p className="text-sm font-semibold">{notesPage.nextActionsTitle}</p>
                  <ol className="list-decimal pl-5 text-sm" data-testid="note-actions">
                    {n.nextActions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {n.practisedTargetIds.length > 0 ? (
                <p className="mt-2 text-sm text-muted">
                  {notesPage.practisedTitle}: {n.practisedTargetIds.map((k) => titleOf.get(k) ?? k).join("; ")}
                </p>
              ) : null}
              {canWrite ? (
                <button type="button" data-testid={`note-edit-${n.id}`} onClick={() => setEditing(n)} className="mt-2 min-h-11 rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent">
                  {notesPage.edit}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canWrite && older.length > 0 ? (
        <details className="text-sm text-muted">
          <summary className="min-h-11 cursor-pointer py-3">{notesPage.olderVersions(older.length)}</summary>
          <ul className="flex flex-col gap-2">
            {older.map((n) => (
              <li key={n.id} className="rounded-lg border border-line px-3 py-2">
                {formatDateVi(n.sessionDate)} · {n.goals ?? n.observed ?? n.nextActions[0] ?? ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
