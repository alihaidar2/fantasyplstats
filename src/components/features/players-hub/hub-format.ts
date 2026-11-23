import { UK_TIME_ZONE } from "@/lib/fpl/schedule";

// Formatting for the players hub. The locale and time zone are fixed so the
// static HTML is the same wherever it's built. Prices, counts and signs reuse
// src/components/features/players/player-format.ts.

const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: UK_TIME_ZONE, day: "numeric", month: "short" });

/** "21 Nov" in UK time; "—" when unknown or unparseable. */
export function formatNewsDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : dayFormat.format(date);
}

/** 47.8 -> "47.8%". */
export const formatOwnership = (percent: number) => `${percent.toFixed(1)}%`;
