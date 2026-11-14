"use client";

import { useState } from "react";
import { fallbackLabels, notesPage, sessionKindCopy } from "@/lib/copy/vi";
import { NoteMarkMenu } from "@/components/sessions/NoteMarkMenu";
import { formatDateVi } from "@/lib/inquiries/format";
import type { LessonNoteView } from "@/lib/review/types";
import { LessonNoteForm } from "./LessonNoteForm";

/** The list of notes (newest first) with the form for the tutor. Parents get the list only (published, current notes). */
export function LessonNotes({
  learnerId,
  notes,
  targets,
  canWrite,
  memberId,
  today,
  minDate,
  tagLabels = {},
  marks,
  makeupChoices = [],
}: {
  learnerId: string;
  notes: LessonNoteView[];
  targets: { id: string; title: string }[];
  canWrite: boolean;
  /** The signed-in member: only the author of a note may edit it (the database also refuses anyone else). */
  memberId: string;
  today: string;
  minDate: string;
  /** Tag key → label, for the "Điểm cần củng cố" of notes written with "Ghi buổi học" (v2). */
  tagLabels?: Record<string, string>;
  /** 3B: the kind that applies to each current note (note id → kind and reason). Absent = the mark menu is off (0030 not applied yet). */
  marks?: Record<string, { kind: "regular" | "makeup" | "not_counted"; reason: string | null }>;
  makeupChoices?: { id: string; label: string }[];
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
              {marks?.[n.id]?.kind === "not_counted" ? (
                <p className="mb-1 text-sm font-semibold text-[#6B4600]" data-testid={`note-not-counted-${n.id}`}>
                  {sessionKindCopy.strike}: {marks[n.id]!.reason}
                </p>
              ) : null}
              <p className={`font-semibold ${marks?.[n.id]?.kind === "not_counted" ? "line-through" : ""}`}>
                {formatDateVi(n.sessionDate)}
                {n.supportLevel ? ` · ${notesPage.supportLevels[n.supportLevel]}` : ""}
                <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs font-normal">{n.published ? notesPage.sharedTag : notesPage.privateTag}</span>
                {marks?.[n.id]?.kind === "makeup" ? <span className="ml-2 rounded-full border border-accent px-2 py-0.5 text-xs font-normal text-accent" data-testid={`note-makeup-${n.id}`}>{sessionKindCopy.makeup}</span> : null}
              </p>
              {n.goals ? <p className="mt-2 text-sm">{n.goals}</p> : null}
              {n.weakTagKeys.length > 0 ? (
                <p className="mt-1 text-sm" data-testid="note-weak-tags">
                  {notesPage.reinforceTitle}: {n.weakTagKeys.map((k) => tagLabels[k] ?? fallbackLabels.tag).join("; ")}
                </p>
              ) : null}
              {n.messageToLearner ? (
                <p className="mt-1 text-sm">
                  {notesPage.messageTitle}: “{n.messageToLearner}”
                </p>
              ) : null}
              {n.noteForParent ? (
                <p className="mt-1 text-sm text-muted" data-testid="note-for-parent">
                  {notesPage.noteForParentTitle}: {n.noteForParent}
                </p>
              ) : null}
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
                  {notesPage.practisedTitle}: {n.practisedTargetIds.map((k) => titleOf.get(k) ?? fallbackLabels.skill).join("; ")}
                </p>
              ) : null}
              {marks ? <NoteMarkMenu learnerId={learnerId} noteId={n.id} current={marks[n.id]?.kind ?? "regular"} makeupChoices={makeupChoices} parentNote={n.authorRole === "parent"} /> : null}
              {canWrite && n.tutorMemberId === memberId && n.supportLevel !== null ? (
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
