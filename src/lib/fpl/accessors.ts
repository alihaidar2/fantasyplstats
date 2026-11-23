// Small, typed readers over the snapshot's per-match and per-gameweek data
// (snapshot version 4): match stats per fixture, the team of the week per
// settled gameweek, and live points for the current gameweek. They return
// player and club ids; join them with `bootstrap.elements` and
// `bootstrap.teams` for names. No Next.js, React or `@/` imports here.

import type { DreamTeam, LiveExplain, SnapshotLive, SnapshotLiveStats } from "./gameweek";
import type { FixtureStatValue, Fixture, FplEvent, MatchStatIdentifier } from "./schemas";
import type { Snapshot } from "./snapshot-schema";
import { isSettled } from "./snapshot";

// ─── Match stats ────────────────────────────────────────────────────────────

/** A stat identifier: one of MATCH_STAT_IDENTIFIERS, or one FPL added later. */
export type StatIdentifier = MatchStatIdentifier | (string & {});

export type Side = "home" | "away";

/** One player's value for one stat in one fixture, with the side they played on. */
export interface MatchStatRow {
  element: number;
  value: number;
  side: Side;
}

const byValue = (a: { value: number; element: number }, b: { value: number; element: number }) =>
  b.value - a.value || a.element - b.element;

/** A fixture by id, or undefined. */
export function findFixture(snapshot: Pick<Snapshot, "fixtures">, fixtureId: number): Fixture | undefined {
  return snapshot.fixtures.find((f) => f.id === fixtureId);
}

/** A gameweek's fixtures in kickoff order (then by id). Postponed fixtures (no gameweek) are never included. */
export function fixturesInGameweek(snapshot: Pick<Snapshot, "fixtures">, gameweek: number): Fixture[] {
  return snapshot.fixtures
    .filter((f) => f.event === gameweek)
    .sort((a, b) => (a.kickoff_time ?? "9999").localeCompare(b.kickoff_time ?? "9999") || a.id - b.id);
}

/**
 * One stat of a fixture, split by side, highest value first. Both lists are
 * empty when nobody has the stat, before kickoff, or when FPL didn't send it.
 */
export function matchStat(
  fixture: Pick<Fixture, "stats">,
  identifier: StatIdentifier,
): { home: FixtureStatValue[]; away: FixtureStatValue[] } {
  const stat = fixture.stats.find((s) => s.identifier === identifier);
  return {
    home: (stat?.h ?? []).map((r) => ({ ...r })).sort(byValue),
    away: (stat?.a ?? []).map((r) => ({ ...r })).sort(byValue),
  };
}

/**
 * One stat of a fixture across both sides, highest value first (ties by
 * player id). For `bps` this is the order provisional bonus is worked out from.
 */
export function matchStatRows(fixture: Pick<Fixture, "stats">, identifier: StatIdentifier): MatchStatRow[] {
  const { home, away } = matchStat(fixture, identifier);
  return [
    ...home.map((r) => ({ ...r, side: "home" as const })),
    ...away.map((r) => ({ ...r, side: "away" as const })),
  ].sort(byValue);
}

/** Every stat identifier FPL sent for a fixture, in FPL's order (unknown ones included). */
export function matchStatIdentifiers(fixture: Pick<Fixture, "stats">): string[] {
  return fixture.stats.map((s) => s.identifier);
}

/**
 * One player's stats in one fixture, e.g. `{ goals_scored: 1, bonus: 3, bps: 41 }`.
 * Stats the player has none of are left out; an empty object means they
 * weren't involved (or the fixture hasn't kicked off).
 */
export function playerMatchStats(fixture: Pick<Fixture, "stats">, playerId: number): Partial<Record<StatIdentifier, number>> {
  const out: Partial<Record<string, number>> = {};
  for (const stat of fixture.stats) {
    const row = stat.h.find((r) => r.element === playerId) ?? stat.a.find((r) => r.element === playerId);
    if (row) out[stat.identifier] = row.value;
  }
  return out;
}

// ─── Team of the week ───────────────────────────────────────────────────────

export interface TeamOfTheWeek {
  gameweek: number;
  /** The gameweek's highest scorer, or null if FPL names none. */
  topPlayer: { id: number; points: number } | null;
  /**
   * The XI in FPL's order: `position` 1–11 is the slot, goalkeeper first, then
   * defenders, midfielders and forwards (as in every recorded gameweek).
   */
  players: DreamTeam["team"];
  /** The XI's points added together. */
  totalPoints: number;
}

/** Gameweeks whose points are final (`finished` and `data_checked`), oldest first. */
export function settledGameweeks(events: readonly Pick<FplEvent, "id" | "finished" | "data_checked">[]): number[] {
  return events.filter(isSettled).map((e) => e.id).sort((a, b) => a - b);
}

/** The team of the week for a settled gameweek, or null (not settled yet, or unknown). */
export function teamOfTheWeek(snapshot: Pick<Snapshot, "dreamTeams">, gameweek: number): TeamOfTheWeek | null {
  const team = snapshot.dreamTeams[gameweek];
  if (!team) return null;
  const players = [...team.team].sort((a, b) => a.position - b.position);
  return {
    gameweek,
    topPlayer: team.top_player,
    players,
    totalPoints: players.reduce((sum, p) => sum + p.points, 0),
  };
}

/** Every team of the week in the snapshot, oldest gameweek first. */
export function teamsOfTheWeek(snapshot: Pick<Snapshot, "dreamTeams">): TeamOfTheWeek[] {
  return Object.keys(snapshot.dreamTeams)
    .map(Number)
    .sort((a, b) => a - b)
    .map((gw) => teamOfTheWeek(snapshot, gw)!);
}

// ─── Live gameweek ──────────────────────────────────────────────────────────

export interface LivePlayer {
  id: number;
  stats: SnapshotLiveStats;
  /** Where the points came from, per fixture (two entries in a double gameweek). Empty for a player with no stats yet. */
  explain: LiveExplain[];
}

/** A player with nothing so far this gameweek. */
export const EMPTY_LIVE_STATS: Readonly<SnapshotLiveStats> = Object.freeze({
  minutes: 0, starts: 0, goals_scored: 0, assists: 0, clean_sheets: 0, goals_conceded: 0, own_goals: 0,
  penalties_saved: 0, penalties_missed: 0, yellow_cards: 0, red_cards: 0, saves: 0, bonus: 0, bps: 0,
  defensive_contribution: 0, total_points: 0,
});

export type EventStatusDay = SnapshotLive["status"]["status"][number];

export interface LiveGameweek {
  gameweek: number;
  /**
   * Players with at least one non-zero stat, by id. A player not in the map
   * has 0 of everything so far: use `livePlayer`, which fills that in.
   */
  players: ReadonlyMap<number, LivePlayer>;
  /**
   * event-status/ rows (one per match day) for this gameweek. `points` is ""
   * before the day's matches and "p" while provisional (community docs say
   * "r" once confirmed; no recording shows it yet). Empty when event-status describes another gameweek.
   */
  days: EventStatusDay[];
  /** True once FPL has added bonus for every match day it lists for this gameweek; false with no rows. */
  bonusAdded: boolean;
  /** FPL's league-table update state from event-status/ ("" when idle). */
  leagues: string;
}

/** The current gameweek's live data, or null when no gameweek is current (pre-season). */
export function liveGameweek(snapshot: Pick<Snapshot, "live">): LiveGameweek | null {
  const live = snapshot.live;
  if (!live) return null;
  const days = live.status.status.filter((d) => d.event === live.gameweek);
  return {
    gameweek: live.gameweek,
    players: new Map(live.elements.map((e) => [e.id, e])),
    days,
    bonusAdded: days.length > 0 && days.every((d) => d.bonus_added),
    leagues: live.status.leagues,
  };
}

/** One player's live line: zeros and no breakdown if they have nothing so far. */
export function livePlayer(live: LiveGameweek, playerId: number): LivePlayer {
  return live.players.get(playerId) ?? { id: playerId, stats: { ...EMPTY_LIVE_STATS }, explain: [] };
}

/** Live points by player id (only players with stats; everyone else has 0). */
export function livePoints(live: LiveGameweek): Map<number, number> {
  return new Map([...live.players.values()].map((p) => [p.id, p.stats.total_points]));
}
