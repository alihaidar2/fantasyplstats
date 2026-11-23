import type { SetPieceDuty } from "@/lib/fpl/transforms";

// Display helpers for the players table. Formatting only: every stat is
// computed in src/lib/fpl/transforms.ts. Type-only imports keep this module
// loadable by Vitest without the `@/` alias.

/** Fixed locale so the static HTML and the hydrated client render the same text. */
const integerFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

/** A typographic minus, which lines up with "+" better than a hyphen. */
const MINUS = "−";

export type Sign = "positive" | "negative" | "zero";

/** The sign of `n` once rounded to `digits` decimals, so 0.004 counts as zero. */
export function signOf(n: number, digits = 0): Sign {
  const rounded = Number(n.toFixed(digits));
  if (rounded > 0) return "positive";
  if (rounded < 0) return "negative";
  return "zero";
}

function signed(n: number, digits: number, body: (abs: number) => string): string {
  const sign = signOf(n, digits);
  const prefix = sign === "positive" ? "+" : sign === "negative" ? MINUS : "";
  return prefix + body(sign === "zero" ? 0 : Math.abs(n));
}

/** 12345 -> "12,345". */
export const formatInteger = (n: number): string => integerFormat.format(n);

/** 12345 -> "+12,345", -50 -> "−50", 0 -> "0". */
export const formatSignedInteger = (n: number): string => signed(n, 0, formatInteger);

/** 1.234 -> "+1.23", -0.63 -> "−0.63", 0 -> "0.00". */
export const formatSignedDecimal = (n: number, digits = 2): string =>
  signed(n, digits, (abs) => abs.toFixed(digits));

/** A price change in £m: 0.1 -> "+£0.1m", -0.2 -> "−£0.2m", 0 -> "£0.0m". */
export const formatPriceChange = (n: number): string =>
  signed(n, 1, (abs) => `£${abs.toFixed(1)}m`);

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th". */
export function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** The player's best (lowest) order across their duties; Infinity with none. */
export const bestSetPieceOrder = (duties: readonly SetPieceDuty[]): number =>
  Math.min(...duties.map((d) => d.order));

/**
 * Ascending set-piece comparison: more duties ranks higher, then a better
 * (lower) best order. Sorted descending, first-choice takers on several duties
 * come first and players with none come last.
 */
export function compareSetPieces(a: readonly SetPieceDuty[], b: readonly SetPieceDuty[]): number {
  if (a.length !== b.length) return a.length - b.length;
  if (a.length === 0) return 0;
  return bestSetPieceOrder(b) - bestSetPieceOrder(a);
}
