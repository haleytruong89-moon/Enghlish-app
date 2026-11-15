import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * How many pages one submission may have right now: 12 once migration 0033 is applied, 6 before (the old function). Found by calling the new
 * function with no arguments: "missing" (PGRST202 / 42883) means 0033 is not there; any other answer means it is. Read once per request.
 */
export const maxPagesPerSubmission = cache(async (): Promise<number> => {
  try {
    const { error } = await createAdminClient().rpc("eng_submit_practice_v2", {
      p_assignment: null, p_by: null, p_client_id: null, p_attempt: null, p_used_hint: null, p_link_url: null, p_files: null,
    });
    return error && (error.code === "PGRST202" || error.code === "42883") ? 6 : 12;
  } catch {
    return 12;
  }
});
