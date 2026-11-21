// Time rules for refreshing FPL data. Premier League "days" are UK days, so
// everything here works in Europe/London time, whatever the host's zone.

import type { Fixture } from "./schemas";

export const UK_TIME_ZONE = "Europe/London";

const ukParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: UK_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function partsOf(date: Date) {
  const parts = Object.fromEntries(
    ukParts.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** UK calendar date as YYYY-MM-DD. */
export function ukDateKey(date: Date): string {
  const { year, month, day } = partsOf(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Minutes the UK is ahead of UTC at `date`: 0 in winter (GMT), 60 in summer (BST). */
export function ukOffsetMinutes(date: Date): number {
  const p = partsOf(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/** The instant the UK calendar day containing `date` began. */
export function startOfUkDay(date: Date): Date {
  const { year, month, day } = partsOf(date);
  const utcMidnight = new Date(Date.UTC(year, month - 1, day));
  // UK clocks change at 01:00 UTC, so the offset at UTC midnight is the
  // offset in force at UK midnight.
  return new Date(utcMidnight.getTime() - ukOffsetMinutes(utcMidnight) * 60_000);
}

function kickoff(fixture: Fixture): Date | null {
  if (!fixture.kickoff_time) return null;
  const date = new Date(fixture.kickoff_time);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** True when any fixture kicks off on the UK calendar day of `now`. */
export function isMatchDay(fixtures: readonly Fixture[], now: Date): boolean {
  const today = ukDateKey(now);
  return fixtures.some((f) => {
    const k = kickoff(f);
    return k !== null && ukDateKey(k) === today;
  });
}

/** Teams with a fixture that kicked off in [since, now]. */
export function teamsThatPlayed(
  fixtures: readonly Fixture[],
  since: Date,
  now: Date,
): Set<number> {
  const teams = new Set<number>();
  for (const f of fixtures) {
    const k = kickoff(f);
    if (k && k >= since && k <= now) {
      teams.add(f.team_h);
      teams.add(f.team_a);
    }
  }
  return teams;
}

/**
 * Scheduled triggers in the deploy workflow, keyed by their cron expression
 * (GitHub cron is UTC). A test checks the workflow uses exactly these.
 */
export const SCHEDULES = {
  /** Every 30 minutes; runs only on match days. */
  "5,35 * * * *": "match-day",
  /** Every 2 hours; runs only on days without matches. */
  "20 */2 * * *": "two-hourly",
  /** 01:40 UK during BST, shortly after the nightly price change. */
  "40 0 * * *": "price-change-bst",
  /** 01:40 UK during GMT. */
  "40 1 * * *": "price-change-gmt",
} as const;

export type ScheduleRole = (typeof SCHEDULES)[keyof typeof SCHEDULES];

export interface RunDecision {
  run: boolean;
  reason: string;
}

/**
 * Whether a scheduled run should go ahead. `fixtures` comes from the previous
 * snapshot, or is null when there is none.
 */
export function planScheduledRun(
  cron: string,
  now: Date,
  fixtures: readonly Fixture[] | null,
): RunDecision {
  const role = (SCHEDULES as Record<string, ScheduleRole>)[cron];
  if (!role) return { run: true, reason: `unknown schedule "${cron}", running to be safe` };

  const bst = ukOffsetMinutes(now) !== 0;
  switch (role) {
    case "price-change-bst":
      return bst
        ? { run: true, reason: "price-change run (BST)" }
        : { run: false, reason: "BST price-change slot, but the UK is on GMT" };
    case "price-change-gmt":
      return bst
        ? { run: false, reason: "GMT price-change slot, but the UK is on BST" }
        : { run: true, reason: "price-change run (GMT)" };
    case "match-day":
      if (fixtures === null) return { run: true, reason: "no previous snapshot to check for matches" };
      return isMatchDay(fixtures, now)
        ? { run: true, reason: "match day: 30-minute refresh" }
        : { run: false, reason: "no matches today: the two-hourly schedule covers this" };
    case "two-hourly":
      if (fixtures === null) return { run: false, reason: "no previous snapshot: the 30-minute schedule covers this" };
      return isMatchDay(fixtures, now)
        ? { run: false, reason: "match day: the 30-minute schedule covers this" }
        : { run: true, reason: "no matches today: two-hourly refresh" };
  }
}
