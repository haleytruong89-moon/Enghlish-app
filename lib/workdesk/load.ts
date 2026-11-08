import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { parseFeedback, parseIntake, parseTeachingNotes, type NameLookup } from "./shape";
import { isMissingRelation } from "./missing";
import { NOTE_FIELDS, type AppFeedbackView, type IntakeView, type NoteField, type TeachingNotesView } from "./types";

/** `available: false` = migration 0025 is not applied yet: the page shows a notice instead of a 500 (same idea as loadSkillStatesSoft). */
export type Soft<T> = { available: true; data: T } | { available: false };

/**
 * Loaders for the W1 screens. Call them only after the page's access check: the tables are read with the USER client (RLS keeps them
 * staff-only and in scope); only the display names come from the admin client (members of the same family, by id).
 */

class Unavailable extends Error {}

function fail(what: string, err: { code?: string; message?: string }): never {
  if (isMissingRelation(err)) throw new Unavailable(what);
  throw new Error(`${what} failed: ${err.code ?? err.message ?? "error"}`);
}

async function nameLookup(ids: string[]): Promise<NameLookup> {
  const unique = [...new Set(ids)];
  const names = new Map<string, string>();
  if (unique.length > 0) {
    const { data, error } = await createAdminClient().from("members").select("id, display_name").in("id", unique);
    if (error) fail("members lookup", error);
    for (const m of (data ?? []) as { id: string; display_name: string }[]) names.set(m.id, m.display_name);
  }
  return (id) => names.get(id) ?? "";
}

async function soft<T>(run: () => Promise<T>): Promise<Soft<T>> {
  try {
    return { available: true, data: await run() };
  } catch (err) {
    if (err instanceof Unavailable) return { available: false };
    throw err;
  }
}

/** The newest row of EACH field is read on its own, so a field written long ago never drops out behind many edits of another one. */
export function loadTeachingNotes(learnerId: string): Promise<Soft<TeachingNotesView>> {
  return soft(async () => {
    const db = await createUserClient();
    const perField = await Promise.all(
      NOTE_FIELDS.map(async (f: NoteField) => {
        const { data, error } = await db
          .from("teaching_notes")
          .select("field, text, author_member, created_at")
          .eq("learner_id", learnerId)
          .eq("field", f)
          .order("created_at", { ascending: false })
          .limit(1);
        if (error) fail("teaching_notes lookup", error);
        return (data ?? []) as { author_member: string }[];
      }),
    );
    const rows = perField.flat();
    return parseTeachingNotes(rows, await nameLookup(rows.map((r) => r.author_member)));
  });
}

export function loadIntake(learnerId: string): Promise<Soft<IntakeView | null>> {
  return soft(async () => {
    const db = await createUserClient();
    const { data, error } = await db.from("learner_intake").select("content, author_member, created_at").eq("learner_id", learnerId).order("created_at", { ascending: false }).limit(1);
    if (error) fail("learner_intake lookup", error);
    const rows = (data ?? []) as { author_member: string }[];
    return parseIntake(data, await nameLookup(rows.map((r) => r.author_member)));
  });
}

/** The app-feedback items the caller may see (RLS: a parent sees the whole family, a tutor only the items they sent) with the newest event. */
export function loadAppFeedback(): Promise<Soft<AppFeedbackView[]>> {
  return soft(async () => {
    const db = await createUserClient();
    const fb = await db.from("app_feedback").select("id, kind, screen, text, by_member, by_role, created_at").order("created_at", { ascending: false }).limit(200);
    if (fb.error) fail("app_feedback lookup", fb.error);
    const rows = (fb.data ?? []) as { id: string; by_member: string }[];
    const ev =
      rows.length === 0
        ? { data: [], error: null }
        : await db.from("app_feedback_events").select("feedback_id, status, reply, created_at").in("feedback_id", rows.map((r) => r.id)).order("created_at", { ascending: false });
    if (ev.error) fail("app_feedback_events lookup", ev.error);
    return parseFeedback(fb.data, ev.data, await nameLookup(rows.map((r) => r.by_member)));
  });
}
