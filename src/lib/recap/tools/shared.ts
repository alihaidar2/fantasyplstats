// Helpers every recap tool uses, and the conventions their results follow.
// The checker relies on these conventions to tie a number to the player or
// match it belongs to:
//
// - A player is always a label object: { player, ref, team, position }
//   (see `label`). Every number inside an object with a `player` key is read
//   as a fact about that player. Never name a player in a bare string.
// - A match is always { home, away, score: "3-1" } (see `matchFact`), with
//   the home side's goals first.
// - Prices are strings like "£6.3m" and percentages strings like "45.2%", so
//   they can't be confused with points or counts. Everything else is a number.
// - Clubs are named as FPL names them ("Man City", "Nott'm Forest").
// - No raw ids, no ISO timestamps and no nulls: leave a key out, or say why
//   the data isn't available in a `note`.

import { z } from "zod";
import type { ContextMatch, ContextPlayer, GameweekContext, SeasonRound } from "../context";
import { createNameIndex, type NameIndex } from "../names";
import { ToolInputError } from "./tool";

export const POSITIONS = ["GKP", "DEF", "MID", "FWD"] as const;

export const positionInput = z
  .enum(POSITIONS)
  .describe("A position: GKP (goalkeeper), DEF (defender), MID (midfielder) or FWD (forward).");

export const playerInput = z
  .string()
  .min(1)
  .describe('A player: the "ref" from an earlier result (e.g. "p430"), or a name such as "Haaland" or "Bruno Fernandes".');

export const teamInput = z
  .string()
  .min(1)
  .describe('A club, by FPL name or short name (e.g. "Man City" or "MCI").');

export const limitInput = (fallback: number, max = 20) =>
  z.number().int().min(1).max(max).default(fallback).describe(`How many to return (default ${fallback}, at most ${max}).`);

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** 63 -> "£6.3m" */
export const formatPrice = (tenths: number) => `£${(tenths / 10).toFixed(1)}m`;

/** 1 -> "+£0.1m", -2 -> "-£0.2m", 0 -> "£0.0m" */
export const formatPriceChange = (tenths: number) =>
  `${tenths < 0 ? "-" : tenths > 0 ? "+" : ""}£${(Math.abs(tenths) / 10).toFixed(1)}m`;

/** 0.452 -> "45.2%" */
export const formatPercent = (ratio: number) => `${(ratio * 100).toFixed(1)}%`;

const indexes = new WeakMap<GameweekContext, NameIndex>();

export function nameIndexOf(context: GameweekContext): NameIndex {
  let index = indexes.get(context);
  if (!index) indexes.set(context, (index = createNameIndex(context.names)));
  return index;
}

export const teamName = (context: GameweekContext, teamId: number) =>
  context.teamById.get(teamId)?.name ?? "Unknown";

export interface PlayerLabel {
  player: string;
  ref: string;
  team: string;
  position: string;
}

/** How every result names a player. */
export function label(context: GameweekContext, player: ContextPlayer): PlayerLabel {
  return {
    player: player.name,
    ref: player.ref,
    team: teamName(context, player.teamId),
    position: player.position,
  };
}

const describe = (context: GameweekContext, p: ContextPlayer) =>
  `${p.name} (${teamName(context, p.teamId)}, ${p.position}, ref ${p.ref})`;

/** Finds the player a tool was asked about, or explains why it can't. */
export function resolvePlayer(context: GameweekContext, query: string): ContextPlayer {
  const ref = /^p(\d+)$/i.exec(query.trim());
  if (ref) {
    const player = context.playerById.get(Number(ref[1]));
    if (!player) throw new ToolInputError(`No player has the ref "${query}" in gameweek ${context.gameweek}.`);
    return player;
  }
  const matches = nameIndexOf(context)
    .lookupPlayer(query)
    .map((id) => context.playerById.get(id))
    .filter((p): p is ContextPlayer => p !== undefined);
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new ToolInputError(
      `No player matches "${query}" in gameweek ${context.gameweek}. Use find_players to search by name, club or position.`,
    );
  }
  const listed = matches.slice(0, 8).map((p) => describe(context, p)).join("; ");
  throw new ToolInputError(`"${query}" matches ${matches.length} players: ${listed}. Ask again with the ref.`);
}

export function resolveTeam(context: GameweekContext, query: string) {
  const id = nameIndexOf(context).lookupTeam(query);
  const team = id === null ? undefined : context.teamById.get(id);
  if (!team) {
    const names = context.teams.map((t) => t.name).join(", ");
    throw new ToolInputError(`No club matches "${query}". The clubs are: ${names}.`);
  }
  return team;
}

export interface MatchFact {
  home: string;
  away: string;
  /** Home goals first. Missing until the match has kicked off. */
  score?: string;
}

/** How every result describes a match. */
export function matchFact(context: GameweekContext, match: ContextMatch): MatchFact {
  const fact: MatchFact = { home: teamName(context, match.homeId), away: teamName(context, match.awayId) };
  if (match.homeScore !== null && match.awayScore !== null) fact.score = `${match.homeScore}-${match.awayScore}`;
  return fact;
}

/** This gameweek's matches involving a team (none in a blank gameweek, two in a double). */
export const matchesOf = (context: GameweekContext, teamId: number) =>
  context.matches.filter((m) => m.homeId === teamId || m.awayId === teamId);

/** A player's row for one gameweek of the season so far, if their team played. */
export const roundOf = (player: ContextPlayer, gameweek: number): SeasonRound | undefined =>
  player.rounds.find((r) => r.gameweek === gameweek);

/** The player's price going into the context's gameweek (their latest known price), in tenths. */
export const priceOf = (player: ContextPlayer): number | undefined => player.rounds.at(-1)?.price;

export interface Ownership {
  /** FPL managers who owned the player at the gameweek's deadline. */
  ownedBy: number;
  /** Share of the managers ranked that gameweek, e.g. "45.2%". Missing if FPL has no manager count for it. */
  ownership?: string;
}

/**
 * Ownership at a gameweek's deadline, from the history row (never today's
 * selected_by_percent). Undefined when the player's team had no match that
 * gameweek, since FPL only records ownership per fixture.
 */
export function ownershipOf(
  context: GameweekContext,
  player: ContextPlayer,
  gameweek = context.gameweek,
): Ownership | undefined {
  const round = roundOf(player, gameweek);
  if (!round) return undefined;
  const managers = context.managers.get(gameweek);
  return managers
    ? { ownedBy: round.owners, ownership: formatPercent(round.owners / managers) }
    : { ownedBy: round.owners };
}

/** Ownership as a number between 0 and 1, for sorting and thresholds. */
export function ownershipRatio(context: GameweekContext, player: ContextPlayer): number | undefined {
  const round = roundOf(player, context.gameweek);
  const managers = context.managers.get(context.gameweek);
  return round && managers ? round.owners / managers : undefined;
}

export interface SeasonTotals {
  gameweeksPlayed: number;
  points: number;
  minutes: number;
  goals: number;
  assists: number;
  bonus: number;
  defensiveContribution: number;
  xG: number;
  xA: number;
}

/** A player's season up to and including the context's gameweek. */
export function seasonTotals(player: ContextPlayer): SeasonTotals {
  const totals: SeasonTotals = {
    gameweeksPlayed: 0, points: 0, minutes: 0, goals: 0, assists: 0, bonus: 0, defensiveContribution: 0, xG: 0, xA: 0,
  };
  for (const r of player.rounds) {
    if (r.minutes > 0) totals.gameweeksPlayed += 1;
    totals.points += r.points;
    totals.minutes += r.minutes;
    totals.goals += r.goals;
    totals.assists += r.assists;
    totals.bonus += r.bonus;
    totals.defensiveContribution += r.defensiveContribution;
    totals.xG += r.xG;
    totals.xA += r.xA;
  }
  totals.xG = round2(totals.xG);
  totals.xA = round2(totals.xA);
  return totals;
}

/**
 * How many of the player's most recent gameweeks in a row satisfy `test`,
 * counting back from the context's gameweek. Zero if the latest one doesn't.
 */
export function currentStreak(player: ContextPlayer, test: (round: SeasonRound) => boolean): number {
  let streak = 0;
  for (let i = player.rounds.length - 1; i >= 0 && test(player.rounds[i]); i--) streak++;
  return streak;
}

export interface TableRow {
  teamId: number;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  /** Results oldest first, at most the last five, e.g. "WWDLW". */
  form: string;
}

/** The league table after the context's gameweek, built from results (FPL's own table fields are always zero). */
export function leagueTable(context: GameweekContext): TableRow[] {
  const rows = new Map<number, TableRow & { results: string[] }>(
    context.teams.map((t) => [
      t.id,
      { teamId: t.id, position: 0, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, form: "", results: [] },
    ]),
  );
  for (const m of context.results) {
    const sides = [
      [rows.get(m.homeId), m.homeScore!, m.awayScore!],
      [rows.get(m.awayId), m.awayScore!, m.homeScore!],
    ] as const;
    for (const [row, scored, conceded] of sides) {
      if (!row) continue;
      row.played += 1;
      row.goalsFor += scored;
      row.goalsAgainst += conceded;
      if (scored > conceded) row.won += 1;
      else if (scored === conceded) row.drawn += 1;
      else row.lost += 1;
      row.points += scored > conceded ? 3 : scored === conceded ? 1 : 0;
      row.results.push(scored > conceded ? "W" : scored === conceded ? "D" : "L");
    }
  }
  return [...rows.values()]
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
        b.goalsFor - a.goalsFor ||
        teamName(context, a.teamId).localeCompare(teamName(context, b.teamId)),
    )
    .map(({ results, ...row }, index) => ({ ...row, position: index + 1, form: results.slice(-5).join("") }));
}

/** The first `limit` items by a descending score, ties broken by the given key so results are stable. */
export function topBy<T>(items: readonly T[], score: (item: T) => number, limit: number, tieBreak: (item: T) => number): T[] {
  return [...items].sort((a, b) => score(b) - score(a) || tieBreak(a) - tieBreak(b)).slice(0, limit);
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The UK weekday of a kickoff ("Saturday"), or undefined when unscheduled. */
export function kickoffDay(kickoff: string | null): string | undefined {
  if (!kickoff) return undefined;
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long" }).format(new Date(kickoff));
  return DAYS.includes(day) ? day : undefined;
}

/** FPL's chip ids as managers know them. */
export const CHIP_NAMES: Record<string, string> = {
  bboost: "Bench Boost",
  freehit: "Free Hit",
  wildcard: "Wildcard",
  "3xc": "Triple Captain",
};

/** A goal or an assist, or a clean sheet for a goalkeeper or defender who played. */
export const returnedThisGameweek = (p: ContextPlayer) =>
  p.gw.goals + p.gw.assists > 0 || ((p.position === "GKP" || p.position === "DEF") && p.gw.cleanSheets > 0);

/** At most this many points is a blank: appearance points and nothing else. */
export const BLANK_MAX_POINTS = 2;

/** How a player's gameweek went for the managers who had them, in one phrase (no names or numbers: the checker reads strings too). */
export function outcomeOf(context: GameweekContext, player: ContextPlayer): string {
  if (!roundOf(player, context.gameweek)) return "club had no match";
  if (player.gw.minutes === 0) return "did not play";
  if (player.gw.points >= 10) return "double-figure haul";
  if (returnedThisGameweek(player)) return "returned";
  return player.gw.points <= BLANK_MAX_POINTS ? "blanked" : "no goal or assist";
}

/** How a player did this gameweek, in the shape every "what happened to this pick" list uses. */
export function gameweekOutcome(context: GameweekContext, player: ContextPlayer) {
  return {
    ...label(context, player),
    points: player.gw.points,
    minutes: player.gw.minutes,
    goals: player.gw.goals,
    assists: player.gw.assists,
    outcome: outcomeOf(context, player),
    ...ownershipOf(context, player),
  };
}

/** Every chip played this gameweek, with its share of managers and whether the count is the season's highest so far. */
export function chipRows(context: GameweekContext) {
  const { gameweek } = context;
  const managers = context.managers.get(gameweek);
  const thisEvent = context.seasonEvents.find((e) => e.gameweek === gameweek);
  const earlier = context.seasonEvents.filter((e) => e.gameweek < gameweek);
  return (thisEvent?.chipPlays ?? []).map((c) => {
    const chip = CHIP_NAMES[c.chip] ?? c.chip;
    const before = earlier.map((e) => ({ gameweek: e.gameweek, played: e.chipPlays.find((x) => x.chip === c.chip)?.played ?? 0 }));
    const previousHigh = topBy(before, (b) => b.played, 1, (b) => b.gameweek)[0];
    return {
      chip,
      played: c.played,
      ...(managers ? { shareOfManagers: formatPercent(c.played / managers) } : {}),
      ...(previousHigh
        ? {
            mostPlayedInAGameweekSoFar: c.played > previousHigh.played,
            previousHigh: { chip, gameweek: previousHigh.gameweek, played: previousHigh.played },
          }
        : {}),
    };
  });
}

/** Transfers every manager made before this gameweek's deadline, against the earlier gameweeks. Undefined in gameweek 1 or when FPL didn't send it. */
export function transfersMadeFact(context: GameweekContext) {
  const { gameweek } = context;
  const transfersMade = context.seasonEvents.find((e) => e.gameweek === gameweek)?.transfersMade;
  if (!context.hasTransfers || transfersMade == null) return undefined;
  const before = context.seasonEvents
    .filter((e) => e.gameweek > 1 && e.gameweek < gameweek && e.transfersMade !== null)
    .map((e) => ({ gameweek: e.gameweek, transfersMade: e.transfersMade! }));
  const previousHigh = topBy(before, (e) => e.transfersMade, 1, (e) => e.gameweek)[0];
  return {
    transfersMade,
    ...(previousHigh
      ? {
          mostTransfersInAGameweekSoFar: transfersMade > previousHigh.transfersMade,
          previousHigh: { gameweek: previousHigh.gameweek, transfersMade: previousHigh.transfersMade },
        }
      : {}),
  };
}

/** Goals in each gameweek so far, and whether this one has the most. */
export function goalsByGameweek(context: GameweekContext) {
  const goals = new Map<number, { gameweek: number; matches: number; goals: number }>();
  for (const m of context.results) {
    const row = goals.get(m.gameweek) ?? { gameweek: m.gameweek, matches: 0, goals: 0 };
    row.matches += 1;
    row.goals += (m.homeScore ?? 0) + (m.awayScore ?? 0);
    goals.set(m.gameweek, row);
  }
  const byGameweek = [...goals.values()].sort((a, b) => a.gameweek - b.gameweek);
  const now = goals.get(context.gameweek)?.goals ?? 0;
  const before = byGameweek.filter((g) => g.gameweek < context.gameweek);
  const previousHigh = topBy(before, (g) => g.goals, 1, (g) => g.gameweek)[0];
  return { byGameweek, now, previousHigh, mostSoFar: previousHigh !== undefined && now > previousHigh.goals };
}

/** Defensive contributions: every gameweek's total, and the best single-player gameweek, with this gameweek against the earlier ones. */
export function defensiveRecords(context: GameweekContext) {
  const { gameweek } = context;
  const totals = new Map<number, number>();
  let bestBefore: { player: ContextPlayer; gameweek: number; defensiveContribution: number } | undefined;
  let bestNow: { player: ContextPlayer; gameweek: number; defensiveContribution: number } | undefined;
  for (const player of context.players) {
    for (const r of player.rounds) {
      totals.set(r.gameweek, (totals.get(r.gameweek) ?? 0) + r.defensiveContribution);
      const row = { player, gameweek: r.gameweek, defensiveContribution: r.defensiveContribution };
      if (r.gameweek < gameweek) {
        if (!bestBefore || r.defensiveContribution > bestBefore.defensiveContribution) bestBefore = row;
      } else if (!bestNow || r.defensiveContribution > bestNow.defensiveContribution) bestNow = row;
    }
  }
  const before = [...totals].filter(([g]) => g < gameweek).map(([g, total]) => ({ gameweek: g, defensiveContribution: total }));
  const previousHigh = topBy(before, (b) => b.defensiveContribution, 1, (b) => b.gameweek)[0];
  const totalNow = totals.get(gameweek) ?? 0;
  return {
    totalNow,
    previousHigh,
    mostSoFar: previousHigh !== undefined && totalNow > previousHigh.defensiveContribution,
    bestNow,
    bestBefore,
    bestIndividualSoFar: bestNow !== undefined && bestBefore !== undefined && bestNow.defensiveContribution > bestBefore.defensiveContribution,
  };
}
