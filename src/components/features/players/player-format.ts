// Number formatting for the player page. The locale is fixed so the server
// render and the browser produce the same text.
const LOCALE = "en-GB";

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(digits: number, signed: boolean): Intl.NumberFormat {
  const key = `${digits}:${signed}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      signDisplay: signed ? "exceptZero" : "auto",
    });
    formatters.set(key, f);
  }
  return f;
}

/** 5637263 -> "5,637,263"; with digits, a fixed number of decimals. */
export function formatNumber(n: number, digits = 0): string {
  return formatter(digits, false).format(n);
}

/** Signed with thousands separators: "+12,345", "-3,210", "0". */
export function formatSigned(n: number, digits = 0): string {
  return formatter(digits, true).format(n);
}

/** 5.5 -> "£5.5m". */
export function formatPrice(millions: number): string {
  return `£${formatNumber(millions, 1)}m`;
}

/** 0.3 -> "+£0.3m", -0.2 -> "-£0.2m", 0 -> "£0.0m". */
export function formatPriceChange(millions: number): string {
  const sign = millions > 0 ? "+" : millions < 0 ? "-" : "";
  return `${sign}${formatPrice(Math.abs(millions))}`;
}

const compactFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const compactWhole = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

/** A count in short form: 5637263 -> "5.6m", 312456 -> "312k", 1234 -> "1.2k". */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 999_500) return `${compactFormat.format(n / 1_000_000)}m`;
  if (abs >= 10_000) return `${compactWhole.format(n / 1_000)}k`;
  if (abs >= 1_000) return `${compactFormat.format(n / 1_000)}k`;
  return compactWhole.format(n);
}

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th". */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}
