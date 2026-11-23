// Finds the numbers in a piece of text, for the checker. The same reader runs
// over the recap and over the strings in tool results, so "£6.3m", "45.2%"
// and "3-1" mean the same thing on both sides.

export type NumberKind =
  /** A count or measure: "17", "1,234", "0.66", "4.2 million", "3rd", "twice". */
  | "plain"
  /** "£6.3m", in millions. */
  | "price"
  /** "45.2%" or "45 per cent". */
  | "percent"
  /** "3-1": `value` is the first number, `other` the second. */
  | "score"
  /** "Gameweek 3" or "GW3". */
  | "gameweek"
  /** "2026/27" or "2026-27": `value` is the starting year. */
  | "season";

export interface NumberToken {
  kind: NumberKind;
  /** Always positive: "-1" and "1" read the same. */
  value: number;
  /** The second number of a score. */
  other?: number;
  /** The precision it was written to: 1 for "17", 0.1 for "6.3", 100000 for "4.2 million". */
  unit: number;
  text: string;
  start: number;
  end: number;
}

const WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  twice: 2, thrice: 3, brace: 2, braces: 2,
};

const MAGNITUDE: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6 };

// Tried in this order at each position. "One" is not read as a number: it is
// far more often a pronoun ("one of the picks of the week").
const NUMBER = new RegExp(
  [
    String.raw`(?<![\p{L}\p{N}])(?<season>\d{4})[/–-](?<seasonEnd>\d{2})(?![\p{N}])`,
    String.raw`£\s?(?<price>\d+(?:\.\d+)?)\s?(?<priceUnit>million|m|k)?(?![\p{L}])`,
    String.raw`(?<![\p{L}])(?:gameweeks?|gw)\s?(?<gameweek>\d{1,2})(?![\d])`,
    String.raw`(?<![\p{L}\p{N}.,–-])(?<home>\d{1,2})\s?[–-]\s?(?<away>\d{1,2})(?![\p{L}\p{N}–-]|[.,]\d)`,
    String.raw`(?<![\p{L}\p{N}.])(?<percent>\d+(?:\.\d+)?)\s?(?:%|per\s?cent(?![\p{L}]))`,
    String.raw`(?<![\p{L}\p{N}.])(?<plain>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s?(?<magnitude>million|thousand|m|k)(?![\p{L}]))?`,
    String.raw`(?<![\p{L}])(?<word>${Object.keys(WORDS).join("|")}|hat[\s-]?tricks?)(?![\p{L}])`,
  ].join("|"),
  "giu",
);

const decimalsOf = (digits: string) => (digits.includes(".") ? digits.length - digits.indexOf(".") - 1 : 0);

export function extractNumbers(text: string): NumberToken[] {
  const tokens: NumberToken[] = [];
  for (const match of text.matchAll(NUMBER)) {
    const g = match.groups!;
    const base = { text: match[0], start: match.index, end: match.index + match[0].length };
    if (g.season !== undefined) {
      tokens.push({ kind: "season", value: Number(g.season), other: Number(g.seasonEnd), unit: 1, ...base });
    } else if (g.price !== undefined) {
      // Prices are in millions; "£100k" is £0.1m.
      const scale = g.priceUnit?.toLowerCase() === "k" ? 0.001 : 1;
      tokens.push({ kind: "price", value: Number(g.price) * scale, unit: 10 ** -decimalsOf(g.price) * scale, ...base });
    } else if (g.gameweek !== undefined) {
      tokens.push({ kind: "gameweek", value: Number(g.gameweek), unit: 1, ...base });
    } else if (g.home !== undefined) {
      tokens.push({ kind: "score", value: Number(g.home), other: Number(g.away), unit: 1, ...base });
    } else if (g.percent !== undefined) {
      tokens.push({ kind: "percent", value: Number(g.percent), unit: 10 ** -decimalsOf(g.percent), ...base });
    } else if (g.plain !== undefined) {
      const digits = g.plain.replace(/,/g, "");
      const scale = g.magnitude ? MAGNITUDE[g.magnitude.toLowerCase()] : 1;
      tokens.push({ kind: "plain", value: Number(digits) * scale, unit: 10 ** -decimalsOf(digits) * scale, ...base });
    } else if (g.word !== undefined) {
      const word = g.word.toLowerCase();
      tokens.push({ kind: "plain", value: WORDS[word] ?? 3, unit: 1, ...base });
    }
  }
  return tokens;
}

/** A number from a tool result's JSON, as a token. */
export function numberToken(value: number): NumberToken {
  const text = String(value);
  return { kind: "plain", value: Math.abs(value), unit: 1, text, start: 0, end: text.length };
}

const EPSILON = 1e-9;

/**
 * Does a number written in the recap agree with one in the evidence? Whole
 * numbers and prices must be equal. A percentage, a decimal or a rounded
 * figure ("4.2 million") may round the evidence to the precision it is
 * written to: "45%" agrees with 45.2%, "1.9" with 1.87, but "2" never agrees
 * with 1.87.
 */
export function numbersAgree(written: NumberToken, evidence: NumberToken): boolean {
  if (written.kind !== evidence.kind) return false;
  if (written.kind === "score") {
    return (
      (written.value === evidence.value && written.other === evidence.other) ||
      (written.value === evidence.other && written.other === evidence.value)
    );
  }
  const difference = Math.abs(written.value - evidence.value);
  const rounds = written.kind === "percent" || (written.kind === "plain" && written.unit !== 1);
  return rounds ? difference <= written.unit / 2 + EPSILON : difference < EPSILON;
}
