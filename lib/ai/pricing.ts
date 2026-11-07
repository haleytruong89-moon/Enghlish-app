/**
 * USD per million tokens, ONE place (spec §5.6). Claude Sonnet 5.5: $2 input / $10 output (official price checked 06/11/2026,
 * platform.claude.com/docs models/sonnet-5-5/overview). Re-check after any model change. Cost is always priced by the REQUESTED model; a
 * model that is not in this table is REFUSED (isPricedModel), never priced with a guess.
 */
export type ModelPrice = { inputPerMTok: number; outputPerMTok: number };

export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-sonnet-5-5": { inputPerMTok: 2, outputPerMTok: 10 },
};

export const isPricedModel = (model: string): boolean => Object.prototype.hasOwnProperty.call(MODEL_PRICES, model);

function priceOf(model: string): ModelPrice {
  const p = isPricedModel(model) ? MODEL_PRICES[model] : undefined;
  if (!p) throw new Error(`pricing: model ${model} has no price (refused)`);
  return p;
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceOf(model);
  return Math.round(((inputTokens * p.inputPerMTok + outputTokens * p.outputPerMTok) / 1e6) * 1e6) / 1e6;
}
