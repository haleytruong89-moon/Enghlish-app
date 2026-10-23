/** Request bodies of the S7a routes (zod). Parsed AFTER requireAccess, so outsiders always get 404 first. */
import { z } from "zod";
import { uuid } from "@/lib/practice/schemas";
import { CONFIRM_ALL_MAX, MANUAL_STATES, REASON_MAX, REASON_MIN } from "./types";

const clientId = z.string().min(8).max(100);
const reason = z.string().trim().max(REASON_MAX);

export const decideBodySchema = z
  .strictObject({ client_id: clientId, action: z.enum(["confirm", "reject"]), reason: reason.optional() })
  .refine((b) => b.action === "confirm" || (b.reason ?? "").length >= REASON_MIN, { path: ["reason"], message: "'Chưa' needs a reason" });
export type DecideBody = z.infer<typeof decideBodySchema>;

export const confirmAllBodySchema = z
  .strictObject({ client_id: clientId, ids: z.array(uuid).min(1).max(CONFIRM_ALL_MAX) })
  .refine((b) => new Set(b.ids).size === b.ids.length, { path: ["ids"], message: "each proposal once" });

export const manualBodySchema = z.strictObject({
  client_id: clientId,
  target_key: z.string().max(100).regex(/^[A-Z]-[A-Z0-9]+(?:-[A-Z0-9]+)*$/),
  state: z.enum(MANUAL_STATES),
  reason: reason.min(REASON_MIN),
});
