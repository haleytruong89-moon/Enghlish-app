/**
 * Login names (S5b-1): "an", "nguyen", "giasu-an"… A person types either an email (has "@") or a short login name.
 * Pure helpers shared by the login action and the scripts (no server-only imports).
 */

/** Same rule as the CHECK in db/migrations/0013_login_names.sql. */
export const LOGIN_NAME_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;

export type LoginInput = { kind: "email"; email: string } | { kind: "name"; name: string } | { kind: "empty" } | { kind: "invalid" };

// Deliberately simple (Supabase does the real check): one "@", no spaces, a dot in the domain.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Normalise a login name: trim + lower-case. Returns null when it is not a valid name. */
export function normalizeLoginName(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  return LOGIN_NAME_RE.test(v) ? v : null;
}

/** "name@x.y" → email; text without "@" → login name (lower-cased); blank → empty; anything else → invalid. */
export function parseLoginInput(raw: string | null | undefined): LoginInput {
  const v = (raw ?? "").trim();
  if (!v) return { kind: "empty" };
  if (v.includes("@")) return v.length <= 254 && EMAIL_RE.test(v) ? { kind: "email", email: v } : { kind: "invalid" };
  const name = normalizeLoginName(v);
  return name ? { kind: "name", name } : { kind: "invalid" };
}
