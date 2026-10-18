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
