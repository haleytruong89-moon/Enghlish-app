/**
 * USD per million tokens, ONE place (spec §5.6). These are ESTIMATES (plan P7): check the Anthropic pricing page / Console before merging
 * and after any model change. An unknown model is priced with the most expensive row, so the monthly cap errs on the safe side.
 */
export type ModelPrice = { inputPerMTok: number; outputPerMTok: number };

export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-sonnet-5-5": { inputPerMTok: 3, outputPerMTok: 15 },
};

export const FALLBACK_PRICE: ModelPrice = Object.values(MODEL_PRICES).reduce((a, b) => (b.outputPerMTok > a.outputPerMTok ? b : a));

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICES[model] ?? FALLBACK_PRICE;
  return Math.round(((inputTokens * p.inputPerMTok + outputTokens * p.outputPerMTok) / 1e6) * 1e6) / 1e6;
}
