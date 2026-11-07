import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { parseFeedback, parseIntake, parseTeachingNotes, type NameLookup } from "./shape";
import type { AppFeedbackView, IntakeView, TeachingNotesView } from "./types";

/**
 * Loaders for the W1 screens. Call them only after the page's access check: the tables are read with the USER client (RLS keeps them
 * staff-only and in scope); only the display names come from the admin client (members of the same family, by id).
 */

function fail(what: string, err: { code?: string; message?: string }): never {
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

export async function loadTeachingNotes(learnerId: string): Promise<TeachingNotesView> {
  const db = await createUserClient();
  const { data, error } = await db
    .from("teaching_notes")
    .select("field, text, author_member, created_at")
    .eq("learner_id", learnerId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) fail("teaching_notes lookup", error);
  const rows = (data ?? []) as { author_member: string }[];
  return parseTeachingNotes(data, await nameLookup(rows.map((r) => r.author_member)));
}

export async function loadIntake(learnerId: string): Promise<IntakeView | null> {
  const db = await createUserClient();
  const { data, error } = await db
    .from("learner_intake")
    .select("content, author_member, created_at")
    .eq("learner_id", learnerId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) fail("learner_intake lookup", error);
  const rows = (data ?? []) as { author_member: string }[];
  return parseIntake(data, await nameLookup(rows.map((r) => r.author_member)));
}

/** Every app-feedback item of the family (RLS) with its newest status event. */
export async function loadAppFeedback(): Promise<AppFeedbackView[]> {
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
}
