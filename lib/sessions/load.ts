import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NoteRow, TaughtRow } from "./types";

type DbNote = { id: string; session_date: string; supersedes_id: string | null; author_role: "tutor" | "parent"; published: boolean; created_at: string };
type DbTaught = { lesson_note_id: string; curriculum_id: string; unit_code: string };

const PAGE = 1000;
/** All rows of an ordered query, page by page (never relies on the server's max_rows). A short page ends it. */
async function pageAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<{ data: T[]; error: boolean }> {
  const out: T[] = [];
  for (let from = 0; from < 100_000; from += PAGE) {
    const r = await page(from, from + PAGE - 1);
    if (r.error) return { data: [], error: true };
    const rows = (r.data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return { data: out, error: false };
}

/**
 * Facts for the session statistics (U9). Call ONLY after a page gate of that child (`notes:read` on the sessions pages, `tutorwork:read` on the desk: the same two roles, tutor and parent, never students): it reads with the admin client so the
 * tutor and the parent see the SAME number (RLS would hide a parent's un-shared notes). It reads ONLY id, date, chain, author role,
 * shared flag and time, plus the Units taught: never the text of a note (goals, observed, notes for the parent, messages to the child).
 * Returns null when the notes cannot be read (the page then shows one soft line).
 */
export async function loadSessionFacts(learnerId: string): Promise<{ notes: NoteRow[]; taught: TaughtRow[] } | null> {
  const db = createAdminClient();
  const n = await pageAll<DbNote>((from, to) => db.from("lesson_notes").select("id, session_date, supersedes_id, author_role, published, created_at").eq("learner_id", learnerId).order("session_date", { ascending: true }).order("id", { ascending: true }).range(from, to));
  if (n.error) return null;
  const notes = n.data.map((r): NoteRow => ({ id: r.id, sessionDate: r.session_date, supersedesId: r.supersedes_id, authorRole: r.author_role, published: r.published, createdAt: r.created_at }));
  // The Units are decoration: a failure here must not hide the count.
  const t = await pageAll<DbTaught>((from, to) => db.from("lesson_note_units").select("lesson_note_id, curriculum_id, unit_code").eq("learner_id", learnerId).order("lesson_note_id", { ascending: true }).order("curriculum_id", { ascending: true }).order("unit_code", { ascending: true }).range(from, to));
  const taught = t.error ? [] : t.data.map((r): TaughtRow => ({ noteId: r.lesson_note_id, curriculumId: r.curriculum_id, unitCode: r.unit_code }));
  return { notes, taught };
}
