import "server-only";
import { loadLevelProfile } from "@/lib/levels/load";
import { currentLevels } from "@/lib/levels/scale";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSkillMap } from "./shape";
import type { SkillMapView } from "./types";

/** The published skill map as one learner sees it (eng_skill_map, service role). Call only after requireLearnerPage / requireAccess. */
export async function loadSkillMap(learnerId: string): Promise<SkillMapView> {
  const { data, error } = await createAdminClient().rpc("eng_skill_map", { p_learner: learnerId });
  if (error) throw new Error(`eng_skill_map failed: ${error.code ?? error.message ?? "error"}`);
  return parseSkillMap(data);
}

/**
 * The map for the tag pickers (P4-c): the published map plus the child's current level per domain. If the level profile cannot be
 * read (e.g. before migration 0020), the map comes without levels and the pickers simply do not sort by level.
 */
export async function loadPickerMap(learnerId: string): Promise<SkillMapView> {
  const [map, profile] = await Promise.all([loadSkillMap(learnerId), loadLevelProfile(learnerId).catch(() => null)]);
  return profile ? { ...map, current: currentLevels(profile) } : map;
}
