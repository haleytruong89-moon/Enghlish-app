import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NoteRow, TaughtRow } from "./types";

type DbNote = { id: string; session_date: string; supersedes_id: string | null; author_role: "tutor" | "parent"; published: boolean; created_at: string };
type DbTaught = { lesson_note_id: string; curriculum_id: string; unit_code: string };

/**
 * Facts for the session statistics (U9). Call ONLY after the page gate (`notes:read`) of that child: it reads with the admin client so the
 * tutor and the parent see the SAME number (RLS would hide a parent's un-shared notes). It reads ONLY id, date, chain, author role,
 * shared flag and time, plus the Units taught: never the text of a note (goals, observed, notes for the parent, messages to the child).
 * Returns null when the notes cannot be read (the page then shows one soft line).
 */
export async function loadSessionFacts(learnerId: string): Promise<{ notes: NoteRow[]; taught: TaughtRow[] } | null> {
  const db = createAdminClient();
  const n = await db.from("lesson_notes").select("id, session_date, supersedes_id, author_role, published, created_at").eq("learner_id", learnerId).range(0, 4999);
  if (n.error) return null;
  const notes = ((n.data ?? []) as DbNote[]).map((r): NoteRow => ({ id: r.id, sessionDate: r.session_date, supersedesId: r.supersedes_id, authorRole: r.author_role, published: r.published, createdAt: r.created_at }));
  // The Units are decoration: a failure here must not hide the count.
  const t = await db.from("lesson_note_units").select("lesson_note_id, curriculum_id, unit_code").eq("learner_id", learnerId).range(0, 9999);
  const taught = t.error ? [] : ((t.data ?? []) as DbTaught[]).map((r): TaughtRow => ({ noteId: r.lesson_note_id, curriculumId: r.curriculum_id, unitCode: r.unit_code }));
  return { notes, taught };
}
