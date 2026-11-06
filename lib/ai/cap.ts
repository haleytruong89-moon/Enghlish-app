/** The AI gate of one child (spec §5.5) as the database computes it (english.eng_ai_gate), typed; plus the same rule in TS for tests. Pure. */
import { z } from "zod";

export type GateReason = "off" | "no_consent" | "cap";
export type GateState = {
  familyId: string;
  enabled: boolean;
  consent: boolean;
  spentUsd: number;
  monthlyCapUsd: number;
  softCapUsd: number;
  softReached: boolean;
  allowed: boolean;
  reason: GateReason | null;
};

const num = z.union([z.number(), z.string()]).transform(Number);
const gateRow = z.object({
  family_id: z.string(),
  enabled: z.boolean(),
  consent: z.boolean(),
  spent_usd: num,
  monthly_cap_usd: num,
  soft_cap_usd: num,
  soft_reached: z.boolean(),
  allowed: z.boolean(),
  reason: z.enum(["off", "no_consent", "cap"]).nullable(),
});

export function parseGate(raw: unknown): GateState {
  const g = gateRow.parse(raw);
  return {
    familyId: g.family_id, enabled: g.enabled, consent: g.consent, spentUsd: g.spent_usd, monthlyCapUsd: g.monthly_cap_usd,
    softCapUsd: g.soft_cap_usd, softReached: g.soft_reached, allowed: g.allowed, reason: g.reason,
  };
}

/** Mirror of eng_ai_gate: switch, then consent, then the cap; the soft cap only warns. */
export function gateDecision(s: { enabled: boolean; consent: boolean; spentUsd: number; monthlyCapUsd: number; softCapUsd: number }) {
  const reason: GateReason | null = !s.enabled ? "off" : !s.consent ? "no_consent" : s.spentUsd >= s.monthlyCapUsd ? "cap" : null;
  return { allowed: reason === null, reason, softReached: s.spentUsd >= s.softCapUsd };
}

export function refusalStatus(reason: GateReason): "refused_cap" | "refused_off" {
  return reason === "cap" ? "refused_cap" : "refused_off";
}

/** First instant of the Vietnamese calendar month (UTC+7, no daylight saving) that contains `now`. */
export function vnMonthStart(now: Date): Date {
  const vn = new Date(now.getTime() + 7 * 3600_000);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), 1) - 7 * 3600_000);
}
