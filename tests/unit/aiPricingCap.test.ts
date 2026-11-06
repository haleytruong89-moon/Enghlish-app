import { describe, expect, it } from "vitest";
import { gateDecision, refusalStatus, vnMonthStart } from "@/lib/ai/cap";
import { estimateCostUsd, FALLBACK_PRICE, MODEL_PRICES } from "@/lib/ai/pricing";

describe("pricing (estimate, one table)", () => {
  it("cost = tokens × price per million; unknown models use the most expensive row", () => {
    const p = MODEL_PRICES["claude-sonnet-5-5"]!;
    expect(estimateCostUsd("claude-sonnet-5-5", 1_000_000, 0)).toBe(p.inputPerMTok);
    expect(estimateCostUsd("claude-sonnet-5-5", 20_000, 8_000)).toBeCloseTo((20_000 * p.inputPerMTok + 8_000 * p.outputPerMTok) / 1e6, 6);
    expect(estimateCostUsd("some-new-model", 0, 1_000_000)).toBe(FALLBACK_PRICE.outputPerMTok);
  });
});

describe("cap (spec §5.5)", () => {
  const base = { enabled: true, consent: true, spentUsd: 0, monthlyCapUsd: 10, softCapUsd: 8 };
  it("off, no consent, at the cap → refused with a reason; soft cap only warns", () => {
    expect(gateDecision({ ...base, enabled: false })).toEqual({ allowed: false, reason: "off", softReached: false });
    expect(gateDecision({ ...base, consent: false })).toEqual({ allowed: false, reason: "no_consent", softReached: false });
    expect(gateDecision({ ...base, spentUsd: 8 })).toEqual({ allowed: true, reason: null, softReached: true });
    expect(gateDecision({ ...base, spentUsd: 9.999 })).toMatchObject({ allowed: true });
    expect(gateDecision({ ...base, spentUsd: 10 })).toEqual({ allowed: false, reason: "cap", softReached: true });
    expect(refusalStatus("cap")).toBe("refused_cap");
    expect(refusalStatus("off")).toBe("refused_off");
    expect(refusalStatus("no_consent")).toBe("refused_off");
  });
  it("the month starts at 00:00 in Viet Nam (UTC+7)", () => {
    expect(vnMonthStart(new Date("2026-11-30T17:30:00Z")).toISOString()).toBe("2026-11-30T17:00:00.000Z"); // 1 Dec 00:30 VN
    expect(vnMonthStart(new Date("2026-11-30T16:59:59Z")).toISOString()).toBe("2026-10-31T17:00:00.000Z"); // still 30 Nov VN
  });
});
