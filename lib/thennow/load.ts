import "server-only";
import { parseThenNowCandidates, type ThenNowCandidates } from "@/lib/student/growthShape";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingFunction } from "./errors";

export type ThenNowAdult = { available: true; data: ThenNowCandidates } | { available: false; /** A real fault (not "migration not applied"): the page says it could not load, and stays up. */ failed?: boolean };

/** The child's own writing the tutor may pick from + the current pick (service role). Call ONLY after the page gate of that child. Migration 0036 not applied → { available: false }. */
export async function loadThenNowCandidates(learnerId: string): Promise<ThenNowAdult> {
  try {
    const { data, error } = await createAdminClient().rpc("eng_then_now_candidates", { p_learner: learnerId });
    if (error) return isMissingFunction(error.code) ? { available: false } : { available: false, failed: true };
    const parsed = parseThenNowCandidates(data);
    return parsed ? { available: true, data: parsed } : { available: false };
  } catch {
    return { available: false, failed: true };
  }
}
