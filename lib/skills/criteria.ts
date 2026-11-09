import "server-only";
import { pickCriteria, type CriteriaRow } from "./view";
import { createAdminClient } from "@/lib/supabase/admin";

/** Call only after the page gate of the child. Never throws: without criteria the cards still show the ladder. */
export async function loadCriteria(targetKeys: readonly string[]): Promise<Record<string, string[]>> {
  if (targetKeys.length === 0) return {};
  try {
    const { data, error } = await createAdminClient().from("targets").select("id, descriptor_version, success_criteria").in("id", [...new Set(targetKeys)]);
    if (error) return {};
    return pickCriteria((data ?? []) as CriteriaRow[]);
  } catch {
    return {};
  }
}
