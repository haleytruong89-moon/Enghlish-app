import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseLevelProfile, parseRecentChanges } from "./shape";
import { RECENT_DAYS, type LevelProfile, type RecentChange } from "./types";
import { mergeRecentChanges } from "./view";

/** The level profile of one child (eng_level_profile, service role). Call only after requireLearnerPage / requireAccess. */
export async function loadLevelProfile(learnerId: string): Promise<LevelProfile> {
  const { data, error } = await createAdminClient().rpc("eng_level_profile", { p_learner: learnerId });
  if (error) throw new Error(`eng_level_profile failed: ${error.code ?? error.message ?? "error"}`);
  return parseLevelProfile(data);
}

/**
 * "Thay đổi cấp gần đây" for the parent home (D11). `learners` must already be the caller's own scope (loadHome reads them with the
 * user client under RLS). A child whose changes cannot be read is skipped; if none could be read the answer is null.
 */
export async function loadRecentLevelChanges(learners: { id: string; alias: string }[]): Promise<RecentChange[] | null> {
  const per = await Promise.all(
    learners.map(async (l): Promise<RecentChange[] | null> => {
      try {
        const { data, error } = await createAdminClient().rpc("eng_recent_level_changes", { p_learner: l.id, p_days: RECENT_DAYS });
        if (error) return null;
        return parseRecentChanges(data).map((c) => ({ ...c, learnerId: l.id, alias: l.alias }));
      } catch {
        return null;
      }
    }),
  );
  return mergeRecentChanges(per);
}
