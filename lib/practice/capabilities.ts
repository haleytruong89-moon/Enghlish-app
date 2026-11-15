import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Used before migration 0033 is applied: the old submit function takes 6 files. */
export const PAGES_BEFORE_0033 = 6;
const KEEP_MS = 5 * 60 * 1000;
let cached: { at: number; max: number } | null = null;

/**
 * How many pages one submission may have right now: what `english.eng_practice_limits()` says (12 since 0033). The function missing (PGRST202 / 42883)
 * means 0033 is not applied yet: 6. Read-only, and remembered for a few minutes on this server so a page does not ask the database every time.
 */
export async function maxPagesPerSubmission(now: number = Date.now()): Promise<number> {
  if (cached && now - cached.at < KEEP_MS) return cached.max;
  let max = 12;
  try {
    const { data, error } = await createAdminClient().rpc("eng_practice_limits");
    if (error) max = error.code === "PGRST202" || error.code === "42883" ? PAGES_BEFORE_0033 : 12;
    else if (data && typeof (data as { max_files?: unknown }).max_files === "number") max = (data as { max_files: number }).max_files;
  } catch {
    return 12; // not remembered: ask again next time
  }
  cached = { at: now, max };
  return max;
}
