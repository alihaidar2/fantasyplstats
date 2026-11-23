// The season dashboard (/gameweeks/) and one page per started gameweek
// (/gameweeks/[gw]/): FPL's own numbers for each gameweek from bootstrap
// `events`, its results, and its team of the week as a formation.

import {
  fixturesInGameweek,
  teamOfTheWeek as readTeamOfTheWeek,
  type Bootstrap,
  type FplEvent,
  type Snapshot,
} from "../../fpl";
import { CHIP_LABELS } from "../../recap-pages";
import {
  formatKickoff,
  gameweekState,
  hasMatchPage,
  hasStarted,
  matchPath,
  matchState,
  playerLookup,
  startedGameweeks,
  teamRefs,
  type GameweekState,
  type MatchState,
  type PlayerRef,
  type TeamRef,
} from "./shared";

type SnapshotParts = Pick<Snapshot, "bootstrap" | "fixtures">;

export interface ChipPlays {
  chip: string;
  label: string;
  played: number;
}

export interface GameweekSummary {
  gameweek: number;
  /** "Gameweek 4" */
  name: string;
  state: GameweekState;
  /** "Fri 12 Sep, 18:30 UK time", or null when FPL has no deadline yet. */
  deadline: string | null;
  /** Null until any points are in (just after the deadline, before the first match). */
  averageScore: number | null;
  highestScore: number | null;
  topScorer: (PlayerRef & { points: number }) | null;
  mostCaptained: PlayerRef | null;
  mostViceCaptained: PlayerRef | null;
  /** The most-owned player that gameweek. */
  mostSelected: PlayerRef | null;
  /** Null for gameweek 1: FPL fills it in, but nobody can make a transfer before the first deadline. */
  mostTransferredIn: PlayerRef | null;
  /** Transfers made before the deadline; null for gameweek 1 (no transfers) or when FPL didn't send it. */
  transfersMade: number | null;
  /** Most played first. */
  chips: ChipPlays[];
  /** Matches played (finished or provisional) and scheduled in the gameweek. */
  matches: { played: number; total: number };
}

/** The "most" players FPL names; a player it no longer lists becomes null rather than a wrong name. */
function summarise(
  event: FplEvent,
  snapshot: SnapshotParts,
  player: (id: number | null | undefined) => PlayerRef | null,
): GameweekSummary {
  const fixtures = fixturesInGameweek(snapshot, event.id);
  const top = event.top_element_info;
  const topPlayer = player(top?.id);
  const firstGameweek = event.id === 1;
  const anyPoints = event.average_entry_score > 0 || (event.highest_score ?? 0) > 0;
  return {
    gameweek: event.id,
    name: event.name,
    state: gameweekState(event, snapshot.fixtures),
    deadline: event.deadline_time ? formatKickoff(event.deadline_time) : null,
    averageScore: anyPoints ? event.average_entry_score : null,
    highestScore: anyPoints ? event.highest_score : null,
    topScorer: top && topPlayer ? { ...topPlayer, points: top.points } : null,
    mostCaptained: player(event.most_captained),
    mostViceCaptained: player(event.most_vice_captained),
    mostSelected: player(event.most_selected),
    mostTransferredIn: firstGameweek ? null : player(event.most_transferred_in),
    transfersMade: firstGameweek || event.transfers_made == null ? null : event.transfers_made,
    chips: [...event.chip_plays]
      .filter((c) => c.num_played > 0)
      .sort((a, b) => b.num_played - a.num_played || a.chip_name.localeCompare(b.chip_name))
      .map((c) => ({ chip: c.chip_name, label: CHIP_LABELS[c.chip_name] ?? c.chip_name, played: c.num_played })),
    matches: {
      played: fixtures.filter((f) => f.finished || f.finished_provisional).length,
      total: fixtures.length,
    },
  };
}

function nameLookup(bootstrap: Pick<Bootstrap, "elements" | "teams">) {
  const known = new Set(bootstrap.elements.map((e) => e.id));
  const ref = playerLookup(bootstrap);
  return (id: number | null | undefined) => (id != null && known.has(id) ? ref(id) : null);
}

/** Every gameweek that has started, newest first. Empty before the season's first deadline. */
export function buildGameweekSummaries(snapshot: SnapshotParts): GameweekSummary[] {
  const player = nameLookup(snapshot.bootstrap);
  return snapshot.bootstrap.events
    .filter((e) => hasStarted(e, snapshot.fixtures))
    .sort((a, b) => b.id - a.id)
    .map((e) => summarise(e, snapshot, player));
}

export interface SeasonPoint {
  gameweek: number;
  average: number;
  highest: number;
}

/** Average and highest score per gameweek for the season chart, oldest first; gameweeks with no points yet are left out. */
export function seasonScores(summaries: readonly GameweekSummary[]): SeasonPoint[] {
  return summaries
    .filter((s) => s.averageScore !== null && s.highestScore !== null)
    .map((s) => ({ gameweek: s.gameweek, average: s.averageScore!, highest: s.highestScore! }))
    .sort((a, b) => a.gameweek - b.gameweek);
}

/** What the first gameweek's deadline is, for the dashboard's pre-season message. */
export function firstDeadline(snapshot: SnapshotParts): string | null {
  const first = [...snapshot.bootstrap.events].sort((a, b) => a.id - b.id)[0];
  return first?.deadline_time ? formatKickoff(first.deadline_time) : null;
}

// ─── One gameweek ───────────────────────────────────────────────────────────

export interface MatchListItem {
  id: number;
  kickoff: string | null;
  state: MatchState;
  /** Minutes played so far, for a live match. */
  minutes: number;
  home: TeamRef;
  away: TeamRef;
  homeScore: number | null;
  awayScore: number | null;
  /** The match page, once the match has kicked off. */
  path: string | null;
}

export type PositionLine = "GKP" | "DEF" | "MID" | "FWD";

export interface FormationPlayer extends PlayerRef {
  points: number;
  /** FPL's top player of the gameweek. */
  top: boolean;
}

export interface FormationView {
  /** "3-4-3": defenders, midfielders, forwards. */
  formation: string;
  /** Goalkeeper first, then defenders, midfielders and forwards. Empty lines are left out. */
  lines: { line: PositionLine; label: string; players: FormationPlayer[] }[];
  totalPoints: number;
}

export interface GameweekPageData {
  summary: GameweekSummary;
  results: MatchListItem[];
  /** Null until FPL settles the gameweek. */
  teamOfTheWeek: FormationView | null;
  previous: number | null;
  next: number | null;
}

const LINES: { id: number; line: PositionLine; label: string }[] = [
  { id: 1, line: "GKP", label: "Goalkeeper" },
  { id: 2, line: "DEF", label: "Defenders" },
  { id: 3, line: "MID", label: "Midfielders" },
  { id: 4, line: "FWD", label: "Forwards" },
];

/**
 * The team of the week as a formation, from FPL's dream team for the gameweek.
 * Lines come from each player's position (FPL keeps positions for the whole
 * season); FPL's own slot order is kept within a line.
 */
export function buildFormation(snapshot: Pick<Snapshot, "bootstrap" | "dreamTeams">, gameweek: number): FormationView | null {
  const team = readTeamOfTheWeek(snapshot, gameweek);
  if (!team || team.players.length === 0) return null;
  const elements = new Map(snapshot.bootstrap.elements.map((e) => [e.id, e]));
  const player = playerLookup(snapshot.bootstrap);
  const topId = team.topPlayer?.id;

  const lines = LINES.map(({ id, line, label }) => ({
    line,
    label,
    players: team.players
      .filter((p) => elements.get(p.element)?.element_type === id)
      .map((p) => ({ ...player(p.element), points: p.points, top: p.element === topId })),
  }));
  // A player FPL no longer lists has no position: keep them, in the last line, rather than drop points.
  const placed = new Set(lines.flatMap((l) => l.players.map((p) => p.id)));
  for (const p of team.players) {
    if (!placed.has(p.element)) lines[3].players.push({ ...player(p.element), points: p.points, top: p.element === topId });
  }

  return {
    formation: lines.slice(1).map((l) => l.players.length).join("-"),
    lines: lines.filter((l) => l.players.length > 0),
    totalPoints: team.totalPoints,
  };
}

export function buildMatchList(snapshot: SnapshotParts, gameweek: number): MatchListItem[] {
  const team = teamRefs(snapshot.bootstrap);
  return fixturesInGameweek(snapshot, gameweek).map((f) => ({
    id: f.id,
    kickoff: f.kickoff_time ? formatKickoff(f.kickoff_time) : null,
    state: matchState(f),
    minutes: f.minutes,
    home: team(f.team_h),
    away: team(f.team_a),
    homeScore: f.team_h_score,
    awayScore: f.team_a_score,
    path: hasMatchPage(f) ? matchPath(f.id) : null,
  }));
}

/** Everything /gameweeks/[gw]/ shows, or null for a gameweek that hasn't started (or doesn't exist). */
export function buildGameweekPage(
  snapshot: Pick<Snapshot, "bootstrap" | "fixtures" | "dreamTeams">,
  gameweek: number,
): GameweekPageData | null {
  const event = snapshot.bootstrap.events.find((e) => e.id === gameweek);
  if (!event || !hasStarted(event, snapshot.fixtures)) return null;
  const started = startedGameweeks(snapshot.bootstrap.events, snapshot.fixtures);
  const i = started.indexOf(gameweek);
  return {
    summary: summarise(event, snapshot, nameLookup(snapshot.bootstrap)),
    results: buildMatchList(snapshot, gameweek),
    teamOfTheWeek: buildFormation(snapshot, gameweek),
    previous: started[i - 1] ?? null,
    next: started[i + 1] ?? null,
  };
}
