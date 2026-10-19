import { z } from "zod";

const preview = z.object({
  alias: z.string(),
  is_test: z.boolean(),
  counts: z.record(z.string(), z.number().int().min(0)),
});

export type PurgePreview = { alias: string; isTest: boolean; counts: Record<string, number> };

/** What eng_purge_preview returns, typed. Anything unexpected throws (→ 500, logged) instead of showing a half-right list. */
export function parsePurgePreview(raw: unknown): PurgePreview {
  const p = preview.parse(raw);
  return { alias: p.alias, isTest: p.is_test, counts: p.counts };
}

/**
 * True when PostgREST/Postgres says the function does not exist: the code was deployed before migration 0017 was applied.
 * (PGRST202 = no function with this name/arguments in the schema cache; 42883 = undefined_function.)
 */
export function isMissingFunction(code: string | undefined): boolean {
  return code === "PGRST202" || code === "42883";
}

/** Thrown by the dry run when migration 0017 is not applied yet. */
export class PurgeNeedsMigrationError extends Error {
  constructor() {
    super("eng_purge_preview is missing: apply migration 0017");
    this.name = "PurgeNeedsMigrationError";
  }
}
