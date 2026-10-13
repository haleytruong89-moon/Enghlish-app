import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicSupabaseEnv, serviceRoleKey } from "@/lib/env";

/**
 * Service-role client (bypasses RLS). Server routes only, and ONLY after
 * requireAccess() has authorized the request. Never expose to the browser.
 */
export function createAdminClient() {
  const { url } = publicSupabaseEnv();
  return createClient(url, serviceRoleKey(), {
    db: { schema: "english" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
