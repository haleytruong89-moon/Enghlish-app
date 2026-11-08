/** Is this a "table / function is not there" error? (migration 0025 not applied yet: Postgres 42P01 / 42883, PostgREST PGRST205 / PGRST202.) */
export function isMissingRelation(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!err) return false;
  if (err.code && ["42P01", "42883", "PGRST205", "PGRST202"].includes(err.code)) return true;
  return /does not exist|schema cache|could not find the (table|function)/i.test(err.message ?? "");
}
