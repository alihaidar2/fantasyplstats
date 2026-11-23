// Shared pieces of the matches and gameweeks pages (step 6d): paths, club and
// player lookups, and when a gameweek or a match counts as started. Pure
// functions of the snapshot; relative imports, not `@/`, so the Vitest tests
// and a future Azure Function can use them. No Next.js or React here.

import type { Bootstrap, Fixture, FplEvent } from "../../fpl";
import { formatDeadline } from "../../home";
import { playerRefs, type PlayerRef } from "../../recap-pages";

export type { PlayerRef };

/** The pages of this area. Paths end in "/" (trailingSlash: true). */
export const MATCHES_PATHS = {
  gameweeks: "/gameweeks/",
  schedule: "/fixtures/schedule/",
} as const;

export const gameweekPath = (gameweek: number) => `/gameweeks/${gameweek}/`;
export const matchPath = (fixtureId: number) => `/matches/${fixtureId}/`;

/** "Sat 12 Sep, 15:00 UK time" (fixed to UK time, so the static page is the same wherever it's built). */
export const formatKickoff = formatDeadline;

export interface TeamRef {
  id: number;
  /** "Arsenal" */
  name: string;
  /** "ARS" */
  short: string;
  /** FPL's club code, for the badge image. */
  code: number;
}

/** The Premier League's badge image for a club code (the same URL the player pages use). */
export const badgeUrl = (code: number) => `https://resources.premierleague.com/premierleague/badges/t${code}.png`;

/** Looks clubs up by id. An unknown id gets a placeholder rather than throwing. */
export function teamRefs(bootstrap: Pick<Bootstrap, "teams">): (id: number) => TeamRef {
  const teams = new Map(bootstrap.teams.map((t) => [t.id, { id: t.id, name: t.name, short: t.short_name, code: t.code }]));
  return (id) => teams.get(id) ?? { id, name: `Team ${id}`, short: "—", code: 0 };
}

/** Looks players up by id, with a placeholder for one FPL no longer lists (so a match never loses a line). */
export function playerLookup(bootstrap: Pick<Bootstrap, "elements" | "teams">): (id: number) => PlayerRef {
  const ref = playerRefs(bootstrap);
  return (id) => ref(id) ?? { id, name: `Player ${id}`, team: "—", path: `/players/${id}/` };
}

// ─── Gameweek and match state ───────────────────────────────────────────────

/**
 * Where a gameweek is: `upcoming` before its deadline, `in-progress` from the
 * deadline until FPL marks it finished, `finished` once it is, and `settled`
 * once FPL has also checked the data (points final, team of the week out).
 */
export type GameweekState = "upcoming" | "in-progress" | "finished" | "settled";

type EventFlags = Pick<FplEvent, "id" | "finished" | "data_checked" | "is_current" | "is_previous">;

/**
 * Whether a gameweek has started: FPL marks it current, previous or finished,
 * or one of its matches has kicked off. (The fixture check keeps a gameweek
 * whose matches have results from being called upcoming if the flags lag.)
 */
export function hasStarted(event: EventFlags, fixtures: readonly Pick<Fixture, "event" | "started">[]): boolean {
  return (
    event.finished ||
    event.data_checked ||
    event.is_current ||
    event.is_previous ||
    fixtures.some((f) => f.event === event.id && f.started === true)
  );
}

export function gameweekState(event: EventFlags, fixtures: readonly Pick<Fixture, "event" | "started">[]): GameweekState {
  if (event.finished && event.data_checked) return "settled";
  if (event.finished) return "finished";
  return hasStarted(event, fixtures) ? "in-progress" : "upcoming";
}

export const GAMEWEEK_STATE_LABELS: Record<GameweekState, string> = {
  upcoming: "Upcoming",
  "in-progress": "In progress",
  finished: "Finished",
  settled: "Final",
};

/** Ids of the gameweeks that have started, oldest first. */
export function startedGameweeks(
  events: readonly EventFlags[],
  fixtures: readonly Pick<Fixture, "event" | "started">[],
): number[] {
  return events.filter((e) => hasStarted(e, fixtures)).map((e) => e.id).sort((a, b) => a - b);
}

/**
 * Where a match is: `finished` once FPL confirms the result and bonus,
 * `provisional` from the final whistle until then, `live` while it's being
 * played, `upcoming` before kickoff, and `postponed` with no gameweek.
 */
export type MatchState = "finished" | "provisional" | "live" | "upcoming" | "postponed";

export function matchState(
  fixture: Pick<Fixture, "event" | "started" | "finished" | "finished_provisional">,
): MatchState {
  if (fixture.finished) return "finished";
  if (fixture.finished_provisional) return "provisional";
  if (fixture.started) return "live";
  return fixture.event === null ? "postponed" : "upcoming";
}

/** Whether a fixture gets a match page: once it has kicked off. */
export const hasMatchPage = (fixture: Pick<Fixture, "event" | "started" | "finished" | "finished_provisional">) =>
  matchState(fixture) !== "upcoming" && matchState(fixture) !== "postponed";
