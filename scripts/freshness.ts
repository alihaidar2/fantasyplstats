// Decides whether the live site's /health.json is fresh enough. Kept apart from
// check-freshness.ts (which does the network request and exits) so tests can
// import it without side effects.

import { z } from "zod";

export const DEFAULT_HEALTH_URL = "https://fantasyplstats.com/health.json";
export const DEFAULT_MAX_AGE_HOURS = 6;
/** Clock skew allowed between the build runner and the checking runner. */
export const MAX_FUTURE_MINUTES = 5;

// Only the fields the check needs; anything else in health.json is ignored.
export const healthSchema = z.object({
  generatedAt: z.iso.datetime({ offset: true }),
  currentGameweek: z.number().int().nullable().optional(),
});

export type FreshnessResult = { ok: boolean; message: string };

const HOUR_MS = 60 * 60 * 1000;

function formatAge(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  return `${(ms / HOUR_MS).toFixed(1)} h`;
}

/** Parses MAX_AGE_HOURS: unset or empty means the default; anything else must be a positive number. */
export function parseMaxAgeHours(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_MAX_AGE_HOURS;
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error(`MAX_AGE_HOURS must be a positive number, got "${value}"`);
  }
  return hours;
}

/** Checks a parsed health.json body against the current time. */
export function checkFreshness(body: unknown, now: Date, maxAgeHours: number): FreshnessResult {
  const parsed = healthSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, message: `health.json is invalid: ${issues}` };
  }

  const { generatedAt, currentGameweek } = parsed.data;
  const ageMs = now.getTime() - Date.parse(generatedAt);
  const gameweek = currentGameweek == null ? "" : `, gameweek ${currentGameweek}`;

  if (ageMs < -MAX_FUTURE_MINUTES * 60_000) {
    return {
      ok: false,
      message: `generatedAt ${generatedAt} is ${formatAge(-ageMs)} in the future`,
    };
  }
  if (ageMs > maxAgeHours * HOUR_MS) {
    return {
      ok: false,
      message: `Site data is stale: generated ${generatedAt} (${formatAge(ageMs)} ago, limit ${maxAgeHours} h${gameweek})`,
    };
  }
  return {
    ok: true,
    message: `Site data is fresh: generated ${generatedAt} (${formatAge(Math.max(ageMs, 0))} ago, limit ${maxAgeHours} h${gameweek})`,
  };
}
