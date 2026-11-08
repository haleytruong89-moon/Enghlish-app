/** Request bodies of the point routes (zod). Parsed AFTER requireAccess, so outsiders always get 404 first. */
import { z } from "zod";
import { POINT_REASON_MAX, POINT_REASON_MIN } from "./types";

const clientId = z.string().min(8).max(100);
export const decidePointBodySchema = z
  .strictObject({ client_id: clientId, action: z.enum(["confirm", "reject", "lower"]), reason: z.string().trim().max(POINT_REASON_MAX).optional() })
  .refine((b) => b.action === "confirm" || (b.reason ?? "").length >= POINT_REASON_MIN, { path: ["reason"], message: "'Chưa' needs a reason" });
export type DecidePointBody = z.infer<typeof decidePointBodySchema>;
