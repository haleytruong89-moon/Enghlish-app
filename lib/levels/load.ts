import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseLevelProfile } from "./shape";
import type { LevelProfile } from "./types";

/** The level profile of one child (eng_level_profile, service role). Call only after requireLearnerPage / requireAccess. */
export async function loadLevelProfile(learnerId: string): Promise<LevelProfile> {
  const { data, error } = await createAdminClient().rpc("eng_level_profile", { p_learner: learnerId });
  if (error) throw new Error(`eng_level_profile failed: ${error.code ?? error.message ?? "error"}`);
  return parseLevelProfile(data);
}
