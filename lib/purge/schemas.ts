import { z } from "zod";

/** Body of POST /api/learners/:id/purge. `confirm_real` is the second confirmation required for a real (non-test) child. */
export const purgeBodySchema = z.strictObject({
  confirm_name: z.string().min(1).max(200),
  confirm_real: z.boolean().optional(),
});
export type PurgeBody = z.infer<typeof purgeBodySchema>;
