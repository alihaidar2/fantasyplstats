// What a model call costs. Prices are US dollars per million tokens.
//
// VERIFY AGAINST CURRENT PRICING before trusting a cost figure:
// https://platform.claude.com/docs/en/about-claude/pricing
// Copied from that page on 22 November 2026 (Fable 5.2 on 23 November 2026). Cache writes are priced at the
// 5-minute rate, which is what anthropic-model.ts asks for.

import type { ModelUsage } from "./model";

export interface TokenPrices {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export interface ModelPrices extends TokenPrices {
  /** Some models charge more for a request whose prompt is longer than a threshold. */
  longPrompt?: { overInputTokens: number } & TokenPrices;
}

/** Keyed by model id. A dated id ("claude-haiku-5-5-20261001") matches its undated entry. */
export const MODEL_PRICES_USD_PER_MTOK: Readonly<Record<string, ModelPrices>> = {
  "claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    cacheWrite: 0.125,
    cacheRead: 0.01,
    longPrompt: { overInputTokens: 100_000, input: 0.5, output: 2.5, cacheWrite: 0.625, cacheRead: 0.05 },
  },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-fable-5-2": { input: 8, output: 40, cacheWrite: 10, cacheRead: 0.2 },
};

export function pricesFor(
  model: string,
  table: Readonly<Record<string, ModelPrices>> = MODEL_PRICES_USD_PER_MTOK,
): ModelPrices | undefined {
  if (table[model]) return table[model];
  const key = Object.keys(table)
    .filter((k) => model.startsWith(`${k}-`))
    .sort((a, b) => b.length - a.length)[0];
  return key === undefined ? undefined : table[key];
}

/**
 * The cost of one request in US dollars, or null when the model has no entry
 * in the table. Per request, because a long-prompt price applies to the
 * request that crossed the threshold and to no other.
 */
export function costOfRequest(
  model: string,
  usage: ModelUsage,
  table: Readonly<Record<string, ModelPrices>> = MODEL_PRICES_USD_PER_MTOK,
): number | null {
  const prices = pricesFor(model, table);
  if (!prices) return null;
  const prompt = usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens;
  const p: TokenPrices = prices.longPrompt && prompt > prices.longPrompt.overInputTokens ? prices.longPrompt : prices;
  return (
    (usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      usage.cacheCreationInputTokens * p.cacheWrite +
      usage.cacheReadInputTokens * p.cacheRead) /
    1_000_000
  );
}

/** Rounds a dollar amount to 8 decimal places, so sums of tiny costs don't carry float noise into saved files. */
export const roundUsd = (usd: number) => Math.round(usd * 1e8) / 1e8;
