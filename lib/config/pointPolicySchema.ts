import { z } from "zod";

const count = z.number().int().min(0).max(1000);

/**
 * Knowledge-point level policy (PP-x). Thresholds live in `english.point_policies`, never in code.
 * DOMAIN §5.2: level 2 from one counted correct answer; level 3 (proposed) from enough counted answers on enough
 * different days; level 4 (proposed) from a later occasion on a different source; ⚑ when recent answers go wrong.
 */
export const pointPolicyConfigSchema = z.strictObject({
  developing: z.strictObject({ minCorrect: count }),
  independent: z.strictObject({ minCounted: count, minAccuracyPct: z.number().int().min(0).max(100), minDistinctDays: count }),
  transferable: z.strictObject({ minCountedCorrect: count, minDaysFromLastOccasion: count, requiresDifferentSource: z.boolean() }),
  flag: z.strictObject({ window: count, minWrong: count }),
  /** Help can raise a point at most to this level (2 = "Đang tiến bộ"). */
  supportCapLevel: z.number().int().min(0).max(4),
});
export type PointPolicy = z.infer<typeof pointPolicyConfigSchema>;

export const pointPolicyFileSchema = z.strictObject({
  version: z.string().regex(/^PP-[0-9]+(\.[0-9]+)*$/),
  config: pointPolicyConfigSchema,
});
export type PointPolicyFile = z.infer<typeof pointPolicyFileSchema>;
