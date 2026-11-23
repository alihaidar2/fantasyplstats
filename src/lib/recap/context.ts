// One gameweek's verified data, as the recap tools see it.
//
// No hindsight: buildGameweekContext cuts everything off at the gameweek it is
// asked about. A context for GW5 holds no history row, result, price or
// ownership figure from GW6 onwards, and none of bootstrap-static's "today"
// values (now_cost, selected_by_percent, total_points, form, status, news),
// because those describe the day the snapshot was taken. The evals replay past
// gameweeks from a later snapshot, so a tool that read today's values would
// leak the future into a past recap. Tools only ever receive this context.

import type {
  DreamTeam,
  Element,
  ElementType,
  EventLive,
  EventStatus,
  Fixture,
  FplEvent,
  FplGameweekClient,
  GameweekFixture,
  HistoryEntry,
  Team,
} from "../fpl";

/**
 * The parts of a snapshot the context reads. A full `Snapshot` fits, and so
 * does a slimmer recording of a season (the eval fixtures keep only players'
 * identity fields, since everything else in bootstrap-static is "today").
 */
export interface SeasonData {
  generatedAt?: string;
  bootstrap: {
    events: Pick<
      FplEvent,
      | "id"
      | "name"
      | "deadline_time"
      | "finished"
      | "is_current"
      | "data_checked"
      | "average_entry_score"
      | "highest_score"
      | "most_captained"
      | "most_transferred_in"
      | "top_element_info"
      | "chip_plays"
      | "ranked_count"
    >[];
    teams: Pick<Team, "id" | "name" | "short_name">[];
    element_types: Pick<ElementType, "id" | "singular_name_short">[];
    elements: (Pick<Element, "id" | "first_name" | "second_name" | "web_name" | "team" | "element_type"> &
      Partial<Pick<Element, "known_name" | "status" | "news" | "chance_of_playing_next_round">>)[];
  };
  fixtures: Pick<
    Fixture,
    "id" | "event" | "kickoff_time" | "started" | "finished" | "team_h" | "team_a" | "team_h_score" | "team_a_score"
  >[];
  summaries: Record<string, { history: HistoryEntry[] }>;
}

/** What buildGameweekContext is built from. */
export interface GameweekSources {
  /** The season: a snapshot, or the same parts of one. */
  snapshot: SeasonData;
  /** event/{gw}/live/ */
  live: EventLive;
  /** fixtures/?event={gw} */
  fixtures: GameweekFixture[];
  /** dream-team/{gw}/ */
  dreamTeam: DreamTeam;
  /** event-status/. It describes only the current gameweek, so it is ignored for any other. */
  eventStatus: EventStatus | null;
}

export interface ContextTeam {
  id: number;
  name: string;
  shortName: string;
}

/** Where a player's points came from in one of the gameweek's fixtures. */
export interface PointsBreakdown {
  fixtureId: number;
  lines: { stat: string; value: number; points: number }[];
}

/** A player's gameweek, from event/{gw}/live/ (both matches added together in a double gameweek). */
export interface GameweekLine {
  points: number;
  minutes: number;
  starts: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  goalsConceded: number;
  ownGoals: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  bonus: number;
  bps: number;
  clearancesBlocksInterceptions: number;
  recoveries: number;
  tackles: number;
  defensiveContribution: number;
  xG: number;
  xA: number;
  xGI: number;
  xGC: number;
  inDreamTeam: boolean;
  /** One entry per fixture the player's team had this gameweek (none in a blank, two in a double). */
  breakdown: PointsBreakdown[];
}

/** One gameweek of a player's season, from their element-summary history (a double gameweek's matches added together). */
export interface SeasonRound {
  gameweek: number;
  /** Fixtures the player's team had that gameweek. */
  matches: number;
  points: number;
  minutes: number;
  goals: number;
  assists: number;
  bonus: number;
  bps: number;
  defensiveContribution: number;
  xG: number;
  xA: number;
  /** Price that gameweek, in tenths of a million. */
  price: number;
  /** FPL managers who owned the player that gameweek. */
  owners: number;
  /** Transfers in minus transfers out in the run-up to that gameweek. */
  transfersBalance: number;
}

export interface ContextPlayer {
  id: number;
  /** Stable handle for tool inputs and results, e.g. "p430". */
  ref: string;
  /** FPL's short display name (web_name), e.g. "B.Fernandes". */
  name: string;
  fullName: string;
  /**
   * The club the player was at in this gameweek, taken from the fixture they
   * most recently had (bootstrap-static only knows their club today, which is
   * wrong for a past gameweek after a mid-season transfer).
   */
  teamId: number;
  /** GKP, DEF, MID or FWD. */
  position: string;
  /**
   * This gameweek. A player with no entry in the live data (recorded live
   * files can drop players who didn't play) gets a line built from their
   * history row instead: zero minutes if they have none.
   */
  gw: GameweekLine;
  /** The season so far, oldest first, never past the context's gameweek. A blank gameweek has no entry. */
  rounds: SeasonRound[];
}

export interface ContextMatch {
  fixtureId: number;
  gameweek: number;
  kickoff: string | null;
  homeId: number;
  awayId: number;
  homeScore: number | null;
  awayScore: number | null;
  started: boolean;
  finished: boolean;
}

/** Per-player stats of one of this gameweek's matches (goals_scored, assists, bonus, ...). */
export interface MatchStat {
  playerId: number;
  side: "home" | "away";
  value: number;
}

export interface GameweekMatch extends ContextMatch {
  stats: Record<string, MatchStat[]>;
}

export interface ContextEvent {
  name: string;
  deadline: string | null;
  finished: boolean;
  dataChecked: boolean;
  averageScore: number;
  highestScore: number | null;
  mostCaptainedId: number | null;
  /** Null in gameweek 1: nobody has made a transfer yet, though FPL still fills the field in. */
  mostTransferredInId: number | null;
  topScorer: { playerId: number; points: number } | null;
  chipPlays: { chip: string; played: number }[];
}

export interface PointsStatus {
  /** One row per match day. `points` is FPL's raw flag: "" not yet, "p" provisional, "r" confirmed. */
  days: { date: string; points: string; bonusAdded: boolean }[];
  /** Every match day has confirmed points and bonus. */
  final: boolean;
}

export interface Availability {
  /** FPL's status letter: a, d, i, s, u or n. */
  status: string;
  news: string;
  chanceOfPlayingNextRound: number | null;
}

/** A name the checker should recognise in recap text. */
export type NameEntry =
  | {
      kind: "player";
      id: number;
      webName: string;
      firstName: string;
      secondName: string;
      knownName: string;
    }
  | { kind: "team"; id: number; name: string; shortName: string };

export interface GameweekContext {
  /** "2026-27" */
  season: string;
  gameweek: number;
  /**
   * True when this is the snapshot's current gameweek. Only then do FPL's
   * "today" values (availability news, event-status) describe this gameweek.
   */
  isLatest: boolean;
  /**
   * False in gameweek 1, which has no transfers: transfer-based facts
   * (transfer balances, most transferred in, price moves) don't exist yet.
   */
  hasTransfers: boolean;
  event: ContextEvent;
  /** Average and highest manager scores of the season so far, this gameweek included. */
  gameweekScores: { gameweek: number; averageScore: number; highestScore: number | null }[];
  /** Managers ranked in each gameweek so far: the base for ownership percentages. */
  managers: ReadonlyMap<number, number>;
  teams: ContextTeam[];
  teamById: ReadonlyMap<number, ContextTeam>;
  /** Players who existed by this gameweek. */
  players: ContextPlayer[];
  playerById: ReadonlyMap<number, ContextPlayer>;
  /** This gameweek's fixtures, in kickoff order. */
  matches: GameweekMatch[];
  /** Every finished match of the season so far, this gameweek included. */
  results: ContextMatch[];
  dreamTeam: { playerId: number; points: number }[];
  /** Null unless `isLatest` and event-status describes this gameweek. */
  pointsStatus: PointsStatus | null;
  /** Injury and suspension news as of the snapshot. Null unless `isLatest`. */
  availability: ReadonlyMap<number, Availability> | null;
  /** Every player and club in the snapshot, for the checker's name dictionary. */
  names: NameEntry[];
}

export class GameweekContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameweekContextError";
  }
}

/** Fetches the four per-gameweek responses. Validation happens in the client. */
export async function fetchGameweekSources(
  client: FplGameweekClient,
  gameweek: number,
): Promise<Omit<GameweekSources, "snapshot">> {
  const [live, fixtures, dreamTeam, eventStatus] = await Promise.all([
    client.getEventLive(gameweek),
    client.getGameweekFixtures(gameweek),
    client.getDreamTeam(gameweek),
    client.getEventStatus(),
  ]);
  return { live, fixtures, dreamTeam, eventStatus };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "2026-27", from the first deadline of the season. */
export function seasonOf(snapshot: Pick<SeasonData, "bootstrap" | "generatedAt">): string {
  const first = snapshot.bootstrap.events.find((e) => e.id === 1)?.deadline_time;
  let start: number;
  if (first) {
    start = new Date(first).getUTCFullYear();
  } else if (snapshot.generatedAt) {
    const at = new Date(snapshot.generatedAt);
    start = at.getUTCMonth() >= 6 ? at.getUTCFullYear() : at.getUTCFullYear() - 1;
  } else {
    throw new GameweekContextError("Can't tell which season this is: gameweek 1 has no deadline.");
  }
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

const EMPTY_LINE: GameweekLine = {
  points: 0, minutes: 0, starts: 0, goals: 0, assists: 0, cleanSheets: 0, goalsConceded: 0, ownGoals: 0,
  penaltiesSaved: 0, penaltiesMissed: 0, yellowCards: 0, redCards: 0, saves: 0, bonus: 0, bps: 0,
  clearancesBlocksInterceptions: 0, recoveries: 0, tackles: 0, defensiveContribution: 0,
  xG: 0, xA: 0, xGI: 0, xGC: 0, inDreamTeam: false, breakdown: [],
};

const byKickoff = (a: ContextMatch, b: ContextMatch) =>
  (a.kickoff ?? "9999").localeCompare(b.kickoff ?? "9999") || a.fixtureId - b.fixtureId;

export function buildGameweekContext(gameweek: number, sources: GameweekSources): GameweekContext {
  const { snapshot, live, fixtures, dreamTeam, eventStatus } = sources;
  const { bootstrap } = snapshot;

  const event = bootstrap.events.find((e) => e.id === gameweek);
  if (!event) throw new GameweekContextError(`Gameweek ${gameweek} is not in the snapshot.`);
  if (live.elements.length === 0) {
    throw new GameweekContextError(`Gameweek ${gameweek} has no live data: it hasn't been played yet.`);
  }
  const stray = fixtures.find((f) => f.event !== gameweek);
  if (stray) {
    throw new GameweekContextError(
      `Fixture ${stray.id} belongs to gameweek ${stray.event}, not gameweek ${gameweek}.`,
    );
  }

  const teams: ContextTeam[] = bootstrap.teams
    .map((t) => ({ id: t.id, name: t.name, shortName: t.short_name }))
    .sort((a, b) => a.id - b.id);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  for (const f of fixtures) {
    if (!teamById.has(f.team_h) || !teamById.has(f.team_a)) {
      throw new GameweekContextError(`Fixture ${f.id} has a team that is not in the snapshot.`);
    }
  }

  const isLatest = bootstrap.events.find((e) => e.is_current)?.id === gameweek;
  const hasTransfers = gameweek > 1;
  const positionOf = new Map(bootstrap.element_types.map((t) => [t.id, t.singular_name_short]));
  const snapshotFixtures = new Map(snapshot.fixtures.map((f) => [f.id, f]));
  const liveById = new Map(live.elements.map((e) => [e.id, e]));

  const players: ContextPlayer[] = [];
  for (const element of bootstrap.elements) {
    // The cutoff: nothing after this gameweek gets into the context.
    const history = (snapshot.summaries[element.id]?.history ?? []).filter((h) => h.round <= gameweek);
    const liveEntry = liveById.get(element.id);
    // Signed after this gameweek: they don't exist yet as far as this recap goes.
    if (!liveEntry && history.length === 0) continue;

    const rounds = new Map<number, SeasonRound>();
    for (const h of history) {
      let round = rounds.get(h.round);
      if (!round) {
        round = {
          gameweek: h.round,
          matches: 0,
          points: 0,
          minutes: 0,
          goals: 0,
          assists: 0,
          bonus: 0,
          bps: 0,
          defensiveContribution: 0,
          xG: 0,
          xA: 0,
          price: h.value,
          owners: h.selected,
          // Gameweek 1 has no transfers, whatever FPL's row says.
          transfersBalance: h.round > 1 ? h.transfers_balance : 0,
        };
        rounds.set(h.round, round);
      }
      round.matches += 1;
      round.points += h.total_points;
      round.minutes += h.minutes;
      round.goals += h.goals_scored;
      round.assists += h.assists;
      round.bonus += h.bonus;
      round.bps += h.bps;
      round.defensiveContribution += h.defensive_contribution;
      round.xG = round2(round.xG + Number(h.expected_goals));
      round.xA = round2(round.xA + Number(h.expected_assists));
    }

    // The team they played for most recently (by this gameweek), in case they
    // have moved since. Falls back to today's team.
    let teamId = element.team;
    const last = history.at(-1);
    const lastFixture = last ? snapshotFixtures.get(last.fixture) : undefined;
    if (last && lastFixture) teamId = last.was_home ? lastFixture.team_h : lastFixture.team_a;

    const s = liveEntry?.stats;
    const thisRound = rounds.get(gameweek);
    players.push({
      id: element.id,
      ref: `p${element.id}`,
      name: element.web_name,
      fullName: element.known_name || `${element.first_name} ${element.second_name}`.trim(),
      teamId,
      position: positionOf.get(element.element_type) ?? "?",
      gw: s
        ? {
            points: s.total_points,
            minutes: s.minutes,
            starts: s.starts,
            goals: s.goals_scored,
            assists: s.assists,
            cleanSheets: s.clean_sheets,
            goalsConceded: s.goals_conceded,
            ownGoals: s.own_goals,
            penaltiesSaved: s.penalties_saved,
            penaltiesMissed: s.penalties_missed,
            yellowCards: s.yellow_cards,
            redCards: s.red_cards,
            saves: s.saves,
            bonus: s.bonus,
            bps: s.bps,
            clearancesBlocksInterceptions: s.clearances_blocks_interceptions ?? 0,
            recoveries: s.recoveries ?? 0,
            tackles: s.tackles ?? 0,
            defensiveContribution: s.defensive_contribution,
            xG: Number(s.expected_goals ?? 0),
            xA: Number(s.expected_assists ?? 0),
            xGI: Number(s.expected_goal_involvements ?? 0),
            xGC: Number(s.expected_goals_conceded ?? 0),
            inDreamTeam: s.in_dreamteam ?? false,
            breakdown: liveEntry.explain.map((x) => ({
              fixtureId: x.fixture,
              lines: x.stats.map((l) => ({ stat: l.identifier, value: l.value, points: l.points })),
            })),
          }
        : {
            ...EMPTY_LINE,
            points: thisRound?.points ?? 0,
            minutes: thisRound?.minutes ?? 0,
            goals: thisRound?.goals ?? 0,
            assists: thisRound?.assists ?? 0,
            bonus: thisRound?.bonus ?? 0,
            bps: thisRound?.bps ?? 0,
            defensiveContribution: thisRound?.defensiveContribution ?? 0,
            xG: thisRound?.xG ?? 0,
            xA: thisRound?.xA ?? 0,
            breakdown: [],
          },
      rounds: [...rounds.values()].sort((a, b) => a.gameweek - b.gameweek),
    });
  }
  const playerById = new Map(players.map((p) => [p.id, p]));
  const known = (id: number | null | undefined): number | null =>
    id != null && playerById.has(id) ? id : null;

  const matches: GameweekMatch[] = fixtures
    .map((f) => {
      const stats: Record<string, MatchStat[]> = {};
      for (const stat of f.stats) {
        const rows: MatchStat[] = [
          ...stat.h.map((r) => ({ playerId: r.element, side: "home" as const, value: r.value })),
          ...stat.a.map((r) => ({ playerId: r.element, side: "away" as const, value: r.value })),
        ].filter((r) => playerById.has(r.playerId));
        if (rows.length) stats[stat.identifier] = rows;
      }
      return {
        fixtureId: f.id,
        gameweek,
        kickoff: f.kickoff_time,
        homeId: f.team_h,
        awayId: f.team_a,
        homeScore: f.team_h_score,
        awayScore: f.team_a_score,
        started: f.started ?? false,
        finished: f.finished,
        stats,
      };
    })
    .sort(byKickoff);

  // Earlier gameweeks' results come from the snapshot; this gameweek's from
  // the fresher fixtures/?event= response.
  const results: ContextMatch[] = [
    ...snapshot.fixtures
      .filter((f) => f.event !== null && f.event < gameweek)
      .map((f) => ({
        fixtureId: f.id,
        gameweek: f.event!,
        kickoff: f.kickoff_time,
        homeId: f.team_h,
        awayId: f.team_a,
        homeScore: f.team_h_score,
        awayScore: f.team_a_score,
        started: f.started ?? false,
        finished: f.finished,
      })),
    ...matches.map(
      (m): ContextMatch => ({
        fixtureId: m.fixtureId,
        gameweek: m.gameweek,
        kickoff: m.kickoff,
        homeId: m.homeId,
        awayId: m.awayId,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        started: m.started,
        finished: m.finished,
      }),
    ),
  ]
    .filter((m) => m.finished && m.homeScore !== null && m.awayScore !== null)
    .sort((a, b) => a.gameweek - b.gameweek || byKickoff(a, b));

  const eventsSoFar = bootstrap.events.filter((e) => e.id <= gameweek).sort((a, b) => a.id - b.id);

  let pointsStatus: PointsStatus | null = null;
  if (isLatest && eventStatus && eventStatus.status.length > 0 && eventStatus.status.every((s) => s.event === gameweek)) {
    const days = eventStatus.status.map((s) => ({ date: s.date, points: s.points, bonusAdded: s.bonus_added }));
    pointsStatus = { days, final: days.every((d) => d.points === "r" && d.bonusAdded) };
  }

  return {
    season: seasonOf(snapshot),
    gameweek,
    isLatest,
    hasTransfers,
    event: {
      name: event.name,
      deadline: event.deadline_time,
      finished: event.finished,
      dataChecked: event.data_checked,
      averageScore: event.average_entry_score,
      highestScore: event.highest_score,
      mostCaptainedId: known(event.most_captained),
      mostTransferredInId: hasTransfers ? known(event.most_transferred_in) : null,
      topScorer:
        event.top_element_info && playerById.has(event.top_element_info.id)
          ? { playerId: event.top_element_info.id, points: event.top_element_info.points }
          : null,
      chipPlays: event.chip_plays.map((c) => ({ chip: c.chip_name, played: c.num_played })),
    },
    gameweekScores: eventsSoFar.map((e) => ({
      gameweek: e.id,
      averageScore: e.average_entry_score,
      highestScore: e.highest_score,
    })),
    managers: new Map(eventsSoFar.filter((e) => e.ranked_count > 0).map((e) => [e.id, e.ranked_count])),
    teams,
    teamById,
    players,
    playerById,
    matches,
    results,
    dreamTeam: dreamTeam.team
      .filter((d) => playerById.has(d.element))
      .map((d) => ({ playerId: d.element, points: d.points })),
    pointsStatus,
    availability: isLatest
      ? new Map(
          bootstrap.elements.flatMap((e): [number, Availability][] =>
            playerById.has(e.id) && e.status !== undefined
              ? [[e.id, { status: e.status, news: e.news ?? "", chanceOfPlayingNextRound: e.chance_of_playing_next_round ?? null }]]
              : [],
          ),
        )
      : null,
    names: [
      ...bootstrap.elements.map(
        (e): NameEntry => ({
          kind: "player",
          id: e.id,
          webName: e.web_name,
          firstName: e.first_name,
          secondName: e.second_name,
          knownName: e.known_name ?? "",
        }),
      ),
      ...bootstrap.teams.map((t): NameEntry => ({ kind: "team", id: t.id, name: t.name, shortName: t.short_name })),
    ],
  };
}
