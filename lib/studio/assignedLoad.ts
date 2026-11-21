import "server-only";
import { createSupabaseInquiryStore } from "@/lib/inquiries/supabaseStore";
import { buildInquiryViews } from "@/lib/inquiries/view";
import { createUserClient } from "@/lib/supabase/server";
import { buildStudioAssigned, currentStudioResults, isStudioTemplateId, type AttemptRow, type EpisodeRow, type RawResultRow, type StudioAssignedRow } from "./assigned";

/**
 * Studio tests of one child with their status. Reads with the USER client (RLS: staff of the child only); call after the page gate.
 * No answer key, no answer text is read here.
 */
export async function loadStudioAssigned(learnerId: string, todayIso: string): Promise<StudioAssignedRow[]> {
  const data = await createSupabaseInquiryStore().listInstances(learnerId);
  const instances = data.instances.filter((i) => isStudioTemplateId(i.template_id));
  if (instances.length === 0) return [];
  const keep = new Set(instances.map((i) => i.id));
  const activities = data.activities.filter((a) => keep.has(a.inquiry_instance_id));
  const acts = new Set(activities.map((a) => a.id));
  const views = buildInquiryViews(instances, activities, data.events.filter((e) => acts.has(e.activity_instance_id)));
  const db = await createUserClient();
  // By learner, not by id lists: the lists grow with every test and would make the request URL too long (RLS is the same).
  const [att, eps, res] = await Promise.all([
    db.from("attempts").select("id, activity_instance_id, attempt_no, submitted_at").eq("learner_id", learnerId).returns<AttemptRow[]>(),
    db.from("episodes").select("id, attempt_id").eq("learner_id", learnerId).returns<EpisodeRow[]>(),
    db
      .from("results")
      .select("id, attempt_id, correct, total_items, not_in_app_items, attempt, supersedes_id")
      .eq("learner_id", learnerId)
      .returns<RawResultRow[]>(),
  ]);
  if (att.error) throw new Error(`attempts lookup: ${att.error.code ?? "error"}`);
  if (eps.error) throw new Error(`episodes lookup: ${eps.error.code ?? "error"}`);
  if (res.error) throw new Error(`results lookup: ${res.error.code ?? "error"}`);
  const attempts = (att.data ?? []).filter((a) => acts.has(a.activity_instance_id));
  // 0037 (feedback, Units of the test): before it is applied the tables are missing and the list simply has neither.
  const [fb, un] = await Promise.all([
    db.from("studio_feedback").select("attempt_id").eq("learner_id", learnerId).returns<{ attempt_id: string }[]>(),
    db.from("studio_assignment_units").select("activity_id, unit_code, ord").eq("learner_id", learnerId).order("ord").returns<{ activity_id: string; unit_code: string; ord: number }[]>(),
  ]);
  const feedbackAttempts = new Set(fb.error ? [] : (fb.data ?? []).map((r) => r.attempt_id));
  const unitsOf = new Map<string, string[]>();
  for (const u of un.error ? [] : (un.data ?? [])) unitsOf.set(u.activity_id, [...(unitsOf.get(u.activity_id) ?? []), u.unit_code]);
  return buildStudioAssigned(views, attempts, eps.data ?? [], currentStudioResults(res.data ?? []), todayIso, { feedbackAttempts, unitsOf });
}
