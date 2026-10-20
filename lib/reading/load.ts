import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { parseReadingReport, parseReadingSkills } from "./shape";
import type { ReadingReportEdit, ReadingSkillsView } from "./types";

/** Call only after requireLearnerPage / requireAccess ("tutorwork:read"). */
function fail(what: string, err: { code?: string; message?: string }): never {
  throw new Error(`${what} failed: ${err.code ?? err.message ?? "error"}`);
}

export async function loadReadingSkills(learnerId: string): Promise<ReadingSkillsView> {
  const { data, error } = await createAdminClient().rpc("eng_reading_skills", { p_learner: learnerId });
  if (error) fail("eng_reading_skills", error);
  return parseReadingSkills(data);
}

/** The reading skills of a track, in report order (user client: RLS on error_tags). */
export async function loadReadingTags(trackId: string): Promise<{ key: string; label: string }[]> {
  const db = await createUserClient();
  const { data, error } = await db
    .from("error_tags")
    .select("key, label_vi")
    .eq("track_id", trackId)
    .eq("group_vi", "Kỹ năng đọc")
    .is("retired_at", null)
    .is("family_id", null)
    .order("created_at", { ascending: true })
    .order("key", { ascending: true });
  if (error) fail("error_tags lookup", error);
  return ((data ?? []) as { key: string; label_vi: string }[]).map((t) => ({ key: t.key, label: t.label_vi }));
}

/** The current TOMO report of one month (user client: RLS keeps it staff-only), or null. */
export async function loadReadingReport(learnerId: string, month: string): Promise<ReadingReportEdit | null> {
  const db = await createUserClient();
  const { data, error } = await db
    .from("reading_reports")
    .select("id, month, source, note, rows, supersedes_id")
    .eq("learner_id", learnerId)
    .eq("month", month)
    .eq("source", "TOMO")
    .order("recorded_at", { ascending: true });
  if (error) fail("reading_reports lookup", error);
  const rows = (data ?? []) as { id: string; supersedes_id: string | null }[];
  const replaced = new Set(rows.map((r) => r.supersedes_id).filter((x): x is string => x !== null));
  return parseReadingReport(rows.find((r) => !replaced.has(r.id)) ?? null);
}
