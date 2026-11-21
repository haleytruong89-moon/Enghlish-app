import "server-only";
import { createSupabaseInquiryStore } from "@/lib/inquiries/supabaseStore";
import { buildInquiryViews } from "@/lib/inquiries/view";
import { createUserClient } from "@/lib/supabase/server";
import { buildStudioAssigned, isStudioTemplateId, type AttemptRow, type EpisodeRow, type ResultRow, type StudioAssignedRow } from "./assigned";

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
  const att = await db.from("attempts").select("id, activity_instance_id, attempt_no, submitted_at").in("activity_instance_id", [...acts]).returns<AttemptRow[]>();
  if (att.error) throw new Error(`attempts lookup: ${att.error.code ?? "error"}`);
  const ids = (att.data ?? []).map((a) => a.id);
  const [eps, res] = ids.length
    ? await Promise.all([
        db.from("episodes").select("id, attempt_id").in("attempt_id", ids).returns<EpisodeRow[]>(),
        db.from("results").select("id, attempt_id, correct, total_items, attempt, supersedes_id").in("attempt_id", ids).returns<(ResultRow & { id: string; supersedes_id: string | null })[]>(),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (eps.error) throw new Error(`episodes lookup: ${eps.error.code ?? "error"}`);
  if (res.error) throw new Error(`results lookup: ${res.error.code ?? "error"}`);
  const superseded = new Set((res.data ?? []).map((r) => r.supersedes_id).filter((x): x is string => !!x));
  const results = (res.data ?? []).filter((r) => !superseded.has(r.id));
  return buildStudioAssigned(views, att.data ?? [], eps.data ?? [], results, todayIso);
}
