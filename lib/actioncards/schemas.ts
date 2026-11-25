/** Request body of POST /api/learners/:id/action-cards (zod, strict). Parsed AFTER the access gate, so outsiders always get 404. */
import { z } from "zod";
import { DECIDABLE_KINDS } from "@/lib/results/actions";

export const REASON_MIN = 3;
export const REASON_MAX = 300;

/** One click on a "Việc nên làm" card: "Đã làm" (done) or "Bỏ qua" (skipped, with a reason). The database checks everything again. */
export const decideBodySchema = z
  .strictObject({
    client_id: z.string().min(8).max(100),
    card_key: z.string().trim().min(1).max(200),
    kind: z.enum(DECIDABLE_KINDS),
    label: z.string().trim().min(1).max(300),
    evidence_at: z.iso.datetime({ offset: true }).nullable(),
    decision: z.enum(["done", "skipped"]),
    reason: z.string().trim().max(REASON_MAX).nullable().optional(),
  })
  .refine((b) => b.decision !== "skipped" || (b.reason ?? "").length >= REASON_MIN, { path: ["reason"], message: "reason_required" });
export type DecideBody = z.infer<typeof decideBodySchema>;
