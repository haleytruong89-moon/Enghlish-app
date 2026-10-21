import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSkillMap } from "./shape";
import type { SkillMapView } from "./types";

/** The published skill map as one learner sees it (eng_skill_map, service role). Call only after requireLearnerPage / requireAccess. */
export async function loadSkillMap(learnerId: string): Promise<SkillMapView> {
  const { data, error } = await createAdminClient().rpc("eng_skill_map", { p_learner: learnerId });
  if (error) throw new Error(`eng_skill_map failed: ${error.code ?? error.message ?? "error"}`);
  return parseSkillMap(data);
}
