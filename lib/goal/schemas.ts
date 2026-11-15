/** Request bodies of the W4d goal routes (zod, strict). Parsed AFTER the access gate, so outsiders always get 404. */
import { z } from "zod";
import { GOAL_LIMITS } from "@/lib/student/goal";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const clientId = z.string().min(8).max(100);
const pieces = z.number().int().min(GOAL_LIMITS.min).max(GOAL_LIMITS.max);

/** The child proposes a number of pieces per week. The range of the track is checked by the database (track_settings). */
export const proposeBodySchema = z.strictObject({ client_id: clientId, pieces });
export const withdrawBodySchema = z.strictObject({ client_id: clientId, goal_id: uuid });
/** The tutor accepts (keeps the number) or adjusts (another number). The start of the goal is never sent: the database sets it. */
export const decideBodySchema = z
  .strictObject({ client_id: clientId, action: z.enum(["accept", "adjust"]), pieces: pieces.optional() })
  .refine((b) => b.action === "accept" || b.pieces !== undefined, { message: "an adjustment needs a number", path: ["pieces"] });
export type ProposeBody = z.infer<typeof proposeBodySchema>;
export type WithdrawBody = z.infer<typeof withdrawBodySchema>;
export type DecideBody = z.infer<typeof decideBodySchema>;
export const GOAL_ID = uuid;
