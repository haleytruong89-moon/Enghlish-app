/**
 * Environment access. No secrets are ever logged or sent to the client.
 * NEXT_PUBLIC_* values are inlined into the browser bundle by Next.js — only the URL and
 * the anon key may use that prefix.
 */

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export function publicSupabaseEnv() {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
}

/** Server only — never import from a client component. */
export function serviceRoleKey(): string {
  return required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * ALLOW_REAL_LEARNERS — must be exactly "true" to show non-test learners.
 * Anything else (unset, "false", typo) → only is_test learners are visible.
 * Vercel previews: keep "false" (DESIGN §2 rule 5, FX-02).
 */
export function allowRealLearners(env: Record<string, string | undefined> = process.env): boolean {
  return env.ALLOW_REAL_LEARNERS === "true";
}
