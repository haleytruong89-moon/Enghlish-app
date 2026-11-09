import "server-only";
import { pickCriteria, type CriteriaRow } from "./view";
import { createUserClient } from "@/lib/supabase/server";
import { logAppError } from "@/lib/ops/logAppError";
import { loadTargetsView } from "@/lib/targets/loadTargets";

/**
 * The catalogue's own checks for the given skills, in the descriptor version of the learner's set (not "the newest string").
 * Uses the USER client: RLS (targets_select) lets members read published targets. Call only after the page gate of the child.
 * Never throws: without criteria the cards still show the ladder; a failure is logged.
 */
export async function loadCriteria(targetKeys: readonly string[], descriptorVersion: string, route = "lib/skills/criteria"): Promise<Record<string, string[]>> {
  if (targetKeys.length === 0) return {};
  try {
    const db = await createUserClient();
    const { data, error } = await db
      .from("targets")
      .select("id, descriptor_version, success_criteria")
      .eq("descriptor_version", descriptorVersion)
      .in("id", [...new Set(targetKeys)]);
    if (error) {
      await logAppError({ route, code: "criteria_load_failed", error: new Error(`targets criteria lookup failed: ${error.code}`) });
      return {};
    }
    return pickCriteria((data ?? []) as CriteriaRow[]);
  } catch (error) {
    await logAppError({ route, code: "criteria_load_failed", error });
    return {};
  }
}

/** For the review inbox (items of several children): each child's own descriptor version. Keys are "learnerId|targetKey". */
export async function loadCriteriaForItems(items: readonly { learnerId: string; targetKey: string }[]): Promise<Record<string, string[]>> {
  const learners = [...new Set(items.map((i) => i.learnerId))];
  const versions = await Promise.all(
    learners.map(async (id) => {
      try {
        return [id, (await loadTargetsView(id))?.descriptorVersion ?? null] as const;
      } catch (error) {
        await logAppError({ route: "lib/skills/criteria", code: "criteria_set_failed", error });
        return [id, null] as const;
      }
    }),
  );
  const versionOf = new Map(versions);
  const byVersion = new Map<string, Set<string>>();
  for (const i of items) {
    const v = versionOf.get(i.learnerId);
    if (!v) continue;
    byVersion.set(v, (byVersion.get(v) ?? new Set()).add(i.targetKey));
  }
  const loaded = await Promise.all([...byVersion].map(async ([v, keys]) => [v, await loadCriteria([...keys], v)] as const));
  const out: Record<string, string[]> = {};
  for (const i of items) {
    const v = versionOf.get(i.learnerId);
    const checks = v ? loaded.find(([lv]) => lv === v)?.[1][i.targetKey] : undefined;
    if (checks) out[`${i.learnerId}|${i.targetKey}`] = checks;
  }
  return out;
}
