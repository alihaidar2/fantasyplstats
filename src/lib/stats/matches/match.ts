// One page per match that has kicked off (/matches/[id]/): the score and each
// side's goals, assists, cards, saves, bonus and defensive contributions, and
// every player's BPS and defensive contributions, from the fixture's per-player `stats` (snapshot v4).

import { matchStat, matchStatRows, type Fixture, type Snapshot, type StatIdentifier } from "../../fpl";
import {
  formatKickoff,
  hasMatchPage,
  matchState,
  playerLookup,
  teamRefs,
  type MatchState,
  type PlayerRef,
  type TeamRef,
} from "./shared";

/** A player and a count, e.g. two goals or 41 BPS. */
export interface MatchPlayer {
  id: number;
  name: string;
  value: number;
}

export interface GoalLine extends MatchPlayer {
  /** Scored by a player of the other side, for this side. */
  ownGoal: boolean;
}

export interface MatchSide {
  team: TeamRef;
  score: number | null;
  /** Goals for this side, own goals by the opponents included (and marked). */
  goals: GoalLine[];
  assists: MatchPlayer[];
  /** Own goals by this side's players (they count for the other side). */
  ownGoals: MatchPlayer[];
  penaltiesSaved: MatchPlayer[];
  penaltiesMissed: MatchPlayer[];
  saves: MatchPlayer[];
  yellowCards: MatchPlayer[];
  redCards: MatchPlayer[];
  /** FPL's bonus, or the provisional bonus from BPS when FPL hasn't added it yet (see `bonusSource`). */
  bonus: MatchPlayer[];
  defensiveContributions: MatchPlayer[];
}

/** One player in the match's player table: BPS, bonus and defensive contributions. */
export interface PlayerLine {
  id: number;
  name: string;
  side: "home" | "away";
  bps: number;
  /** 1 for the highest BPS; tied players share a rank (1, 1, 3). */
  rank: number;
  /** FPL's bonus, or the provisional bonus (see `bonusSource`). */
  bonus: number;
  defensiveContribution: number;
}

/**
 * Where the bonus comes from: `fpl` once FPL has added it, `provisional` when
 * it's worked out from BPS (a match in play or awaiting confirmation), and
 * `none` when neither is possible (no BPS yet).
 */
export type BonusSource = "fpl" | "provisional" | "none";

export interface MatchPageData {
  id: number;
  gameweek: number | null;
  state: MatchState;
  kickoff: string | null;
  kickoffIso: string | null;
  minutes: number;
  home: MatchSide;
  away: MatchSide;
  /**
   * Every player FPL lists with BPS or defensive contributions, by BPS
   * (highest first). FPL lists only non-zero values, so a player with neither
   * isn't here.
   */
  players: PlayerLine[];
  bonusSource: BonusSource;
}

/** BPS rank and bonus a match would award: 3, 2 and 1 for the top three ranks, with ties sharing (FPL's rule). */
export function provisionalBonus(rows: readonly { element: number; value: number }[]): Map<number, number> {
  const sorted = [...rows].sort((a, b) => b.value - a.value || a.element - b.element);
  const bonus = new Map<number, number>();
  sorted.forEach((row, i) => {
    const rank = rankAt(sorted, i);
    if (rank <= 3) bonus.set(row.element, 4 - rank);
  });
  return bonus;
}

/** Standard competition rank (1, 1, 3) of the i-th row of a list sorted by value, highest first. */
function rankAt(sorted: readonly { value: number }[], i: number): number {
  let first = i;
  while (first > 0 && sorted[first - 1].value === sorted[i].value) first--;
  return first + 1;
}

const STAT_IDS = {
  goals: "goals_scored",
  assists: "assists",
  ownGoals: "own_goals",
  penaltiesSaved: "penalties_saved",
  penaltiesMissed: "penalties_missed",
  saves: "saves",
  yellowCards: "yellow_cards",
  redCards: "red_cards",
  bonus: "bonus",
  bps: "bps",
  defensiveContributions: "defensive_contribution",
} as const satisfies Record<string, StatIdentifier>;

/** Everything /matches/[id]/ shows, or null for an unknown fixture or one that hasn't kicked off. */
export function buildMatchPage(snapshot: Pick<Snapshot, "bootstrap" | "fixtures">, fixtureId: number): MatchPageData | null {
  const fixture = snapshot.fixtures.find((f) => f.id === fixtureId);
  if (!fixture || !hasMatchPage(fixture)) return null;
  return buildMatch(snapshot, fixture);
}

export function buildMatch(snapshot: Pick<Snapshot, "bootstrap">, fixture: Fixture): MatchPageData {
  const team = teamRefs(snapshot.bootstrap);
  const player = playerLookup(snapshot.bootstrap);
  const line = (r: { element: number; value: number }): MatchPlayer => {
    const p: PlayerRef = player(r.element);
    return { id: p.id, name: p.name, value: r.value };
  };
  const bySide = (id: StatIdentifier) => {
    const { home, away } = matchStat(fixture, id);
    return { home: home.map(line), away: away.map(line) };
  };

  const state = matchState(fixture);
  const bpsRows = matchStatRows(fixture, STAT_IDS.bps);
  const confirmed = bySide(STAT_IDS.bonus);
  const hasFplBonus = confirmed.home.length + confirmed.away.length > 0;
  // FPL lists bonus once it's added. Until then (live or awaiting confirmation), work it out from BPS.
  const bonusSource: BonusSource = hasFplBonus
    ? "fpl"
    : state !== "finished" && bpsRows.length > 0
      ? "provisional"
      : "none";
  const bonusById =
    bonusSource === "fpl"
      ? new Map([...confirmed.home, ...confirmed.away].map((b) => [b.id, b.value]))
      : bonusSource === "provisional"
        ? provisionalBonus(bpsRows)
        : new Map<number, number>();

  // BPS rows, then anyone with defensive contributions but no BPS (0 BPS: FPL leaves them out of `bps`).
  const dcRows = matchStatRows(fixture, STAT_IDS.defensiveContributions);
  const dcById = new Map(dcRows.map((r) => [r.element, r.value]));
  const listed = new Set(bpsRows.map((r) => r.element));
  const merged = [
    ...bpsRows,
    ...dcRows.filter((r) => !listed.has(r.element)).map((r) => ({ element: r.element, side: r.side, value: 0 })),
  ].sort((a, b) => b.value - a.value || a.element - b.element);
  const players: PlayerLine[] = merged.map((r, i) => ({
    id: r.element,
    name: player(r.element).name,
    side: r.side,
    bps: r.value,
    rank: rankAt(merged, i),
    bonus: bonusById.get(r.element) ?? 0,
    defensiveContribution: dcById.get(r.element) ?? 0,
  }));

  const bonusFor = (side: "home" | "away"): MatchPlayer[] =>
    bonusSource === "fpl"
      ? confirmed[side]
      : players.filter((r) => r.side === side && r.bonus > 0).map(({ id, name, bonus }) => ({ id, name, value: bonus }));

  const goals = bySide(STAT_IDS.goals);
  const ownGoals = bySide(STAT_IDS.ownGoals);
  const side = (s: "home" | "away"): MatchSide => {
    const other = s === "home" ? "away" : "home";
    return {
      team: team(s === "home" ? fixture.team_h : fixture.team_a),
      score: s === "home" ? fixture.team_h_score : fixture.team_a_score,
      goals: [
        ...goals[s].map((g) => ({ ...g, ownGoal: false })),
        ...ownGoals[other].map((g) => ({ ...g, ownGoal: true })),
      ],
      assists: bySide(STAT_IDS.assists)[s],
      ownGoals: ownGoals[s],
      penaltiesSaved: bySide(STAT_IDS.penaltiesSaved)[s],
      penaltiesMissed: bySide(STAT_IDS.penaltiesMissed)[s],
      saves: bySide(STAT_IDS.saves)[s],
      yellowCards: bySide(STAT_IDS.yellowCards)[s],
      redCards: bySide(STAT_IDS.redCards)[s],
      bonus: bonusFor(s),
      defensiveContributions: bySide(STAT_IDS.defensiveContributions)[s],
    };
  };

  return {
    id: fixture.id,
    gameweek: fixture.event,
    state,
    kickoff: fixture.kickoff_time ? formatKickoff(fixture.kickoff_time) : null,
    kickoffIso: fixture.kickoff_time,
    minutes: fixture.minutes,
    home: side("home"),
    away: side("away"),
    players,
    bonusSource,
  };
}

/** Ids of every fixture with a match page, in id order. */
export function matchPageIds(snapshot: Pick<Snapshot, "fixtures">): number[] {
  return snapshot.fixtures.filter(hasMatchPage).map((f) => f.id).sort((a, b) => a - b);
}
