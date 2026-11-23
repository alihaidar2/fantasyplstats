// Turn validated FPL data into the slim view models the pages render.

import { UK_TIME_ZONE } from "./schedule";
import type {
  Bootstrap,
  Element,
  ElementSummary,
  FplEvent,
  Fixture,
} from "./schemas";
import type { Snapshot } from "./snapshot-schema";

// ─── Gameweeks ──────────────────────────────────────────────────────────────

/** The gameweek the site opens on: the next one, else the current, else the last. */
export function defaultGameweek(events: readonly FplEvent[]): number {
  const next = events.find((e) => e.is_next);
  if (next) return next.id;
  const current = events.find((e) => e.is_current);
  if (current) return current.id;
  return Math.max(...events.map((e) => e.id));
}

export function currentGameweek(events: readonly FplEvent[]): number | null {
  return events.find((e) => e.is_current)?.id ?? null;
}

// ─── Fixture matrix ─────────────────────────────────────────────────────────

export interface MatrixFixture {
  opponent: string;
  home: boolean;
  difficulty: number;
}

export interface MatrixRow {
  team: string;
  /** `weeks[gw - 1]` holds every fixture that week: empty for a blank, two for a double. */
  weeks: MatrixFixture[][];
}

export interface FixtureMatrix {
  gameweeks: number;
  defaultRange: [number, number];
  rows: MatrixRow[];
}

/** How many gameweeks the matrix shows by default. */
export const DEFAULT_RANGE_LENGTH = 6;

export function buildFixtureMatrix(
  bootstrap: Pick<Bootstrap, "teams" | "events">,
  fixtures: readonly Fixture[],
): FixtureMatrix {
  const gameweeks = Math.max(...bootstrap.events.map((e) => e.id));
  const shortName = new Map(bootstrap.teams.map((t) => [t.id, t.short_name]));
  const weeksByTeam = new Map<number, MatrixFixture[][]>(
    bootstrap.teams.map((t) => [t.id, Array.from({ length: gameweeks }, () => [])]),
  );

  const scheduled = fixtures
    .filter((f) => f.event !== null && f.event >= 1 && f.event <= gameweeks)
    .sort((a, b) => (a.kickoff_time ?? "").localeCompare(b.kickoff_time ?? "") || a.id - b.id);

  for (const f of scheduled) {
    const col = f.event! - 1;
    const home = shortName.get(f.team_h);
    const away = shortName.get(f.team_a);
    if (!home || !away) continue;
    weeksByTeam.get(f.team_h)![col].push({ opponent: away, home: true, difficulty: f.team_h_difficulty });
    weeksByTeam.get(f.team_a)![col].push({ opponent: home, home: false, difficulty: f.team_a_difficulty });
  }

  const from = Math.min(defaultGameweek(bootstrap.events), gameweeks);
  const rows = [...bootstrap.teams]
    .sort((a, b) => a.short_name.localeCompare(b.short_name))
    .map((t) => ({ team: t.short_name, weeks: weeksByTeam.get(t.id)! }));

  return {
    gameweeks,
    defaultRange: [from, Math.min(from + DEFAULT_RANGE_LENGTH - 1, gameweeks)],
    rows,
  };
}

/** Mean difficulty over every fixture in gameweeks [from, to], so a double counts twice. */
export function averageDifficulty(row: MatrixRow, from: number, to: number): number | undefined {
  let sum = 0;
  let count = 0;
  for (let gw = from; gw <= to; gw++) {
    for (const f of row.weeks[gw - 1] ?? []) {
      sum += f.difficulty;
      count++;
    }
  }
  return count ? sum / count : undefined;
}

/** Sort key for one gameweek cell: mean difficulty, with a blank ranked hardest. */
export function weekSortValue(week: readonly MatrixFixture[]): number {
  if (week.length === 0) return 6;
  return week.reduce((sum, f) => sum + f.difficulty, 0) / week.length;
}

// ─── Players ────────────────────────────────────────────────────────────────

/** Rounds away floating-point noise (0.1 + 0.2) for display and sorting. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/** A price in tenths of a million (FPL's unit) as millions. */
const toMillions = (tenths: number) => round2(tenths / 10);

export type AvailabilityStatus = "doubtful" | "injured" | "suspended" | "unavailable" | "not-eligible";

/** Why a player might miss the next gameweek. Null when they're fully available. */
export interface Availability {
  status: AvailabilityStatus;
  /** FPL's chance of playing next round, in percent; null when FPL gives none. */
  chance: number | null;
  news: string;
}

const STATUS_BY_CODE: Record<string, AvailabilityStatus> = {
  d: "doubtful",
  i: "injured",
  s: "suspended",
  u: "unavailable",
  n: "not-eligible",
};

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  doubtful: "Doubtful",
  injured: "Injured",
  suspended: "Suspended",
  unavailable: "Unavailable",
  "not-eligible": "Not eligible",
};

export function availabilityOf(
  e: Pick<Element, "status" | "chance_of_playing_next_round" | "news">,
): Availability | null {
  const chance = e.chance_of_playing_next_round;
  const status =
    STATUS_BY_CODE[e.status] ??
    // An "available" player with a reduced chance is effectively doubtful.
    (chance !== null && chance < 100 ? "doubtful" : null);
  if (!status) return null;
  return { status, chance, news: e.news };
}

export type SetPieceKind = "penalties" | "freekicks" | "corners";

export interface SetPieceDuty {
  kind: SetPieceKind;
  /** 1 is first choice. */
  order: number;
}

export const SET_PIECE_LABELS: Record<SetPieceKind, string> = {
  penalties: "Penalties",
  freekicks: "Direct free kicks",
  corners: "Corners and indirect free kicks",
};

/** The player's set-piece duties, in FPL's order (penalties, free kicks, corners). */
export function setPieceDuties(
  e: Pick<
    Element,
    "penalties_order" | "direct_freekicks_order" | "corners_and_indirect_freekicks_order"
  >,
): SetPieceDuty[] {
  const duties: [SetPieceKind, number | null][] = [
    ["penalties", e.penalties_order],
    ["freekicks", e.direct_freekicks_order],
    ["corners", e.corners_and_indirect_freekicks_order],
  ];
  return duties.flatMap(([kind, order]) => (order === null ? [] : [{ kind, order }]));
}

/** One row of the players table. Each group of fields feeds one table view. */
export interface PlayerRow {
  id: number;
  /** FPL's short display name ("Raya", "B.Fernandes"), as the table shows it. */
  name: string;
  /** First and second name, for the name's tooltip and for search. */
  fullName: string;
  team: string;
  position: string;
  positionId: number;
  /** Shown on every view; null when the player is fully available. */
  availability: Availability | null;

  // Overview
  price: number;
  totalPoints: number;
  pointsPerGame: number;
  form: number;
  selectedByPercent: number;
  goals: number;
  assists: number;
  cleanSheets: number;

  // Attack
  xg: number;
  xa: number;
  xgi: number;
  xgPer90: number;
  xaPer90: number;
  xgiPer90: number;
  /** Goals scored minus expected goals: positive means finishing above expectation. */
  goalsMinusXg: number;
  setPieces: SetPieceDuty[];

  // Defence
  defensiveContribution: number;
  defensiveContributionPer90: number;
  /** Clearances, blocks and interceptions. */
  cbi: number;
  tackles: number;
  recoveries: number;
  xgcPer90: number;
  savesPer90: number;

  // Transfers and price
  transfersInEvent: number;
  transfersOutEvent: number;
  /** Transfers in minus out this gameweek. */
  netTransfersEvent: number;
  /** Price change in £m this gameweek and since the season started. */
  priceChangeEvent: number;
  priceChangeStart: number;

  // Minutes and bonus
  minutes: number;
  starts: number;
  bonus: number;
  bps: number;
}

function lookups(bootstrap: Pick<Bootstrap, "teams" | "element_types">) {
  const teams = new Map(bootstrap.teams.map((t) => [t.id, t]));
  const positions = new Map(bootstrap.element_types.map((p) => [p.id, p]));
  return { teams, positions };
}

const fullName = (e: Element) => `${e.first_name} ${e.second_name}`.trim() || e.web_name;
const shortName = (e: Element) => e.web_name.trim() || fullName(e);

/** Letters that Unicode normalization doesn't reduce to plain ASCII. */
const FOLDED_LETTERS: Record<string, string> = {
  ø: "o",
  æ: "ae",
  œ: "oe",
  ß: "ss",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "th",
  ı: "i",
};

/** Lower case without accents, so "Ødegaard" and "Magalhães" match "odegaard" and "magalhaes". */
export function foldForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[øæœßłđðþı]/g, (c) => FOLDED_LETTERS[c]);
}

/**
 * Whether a player matches the table's name search. Every word of the query
 * must appear in the short name or the full name (which holds the first and
 * second names), ignoring case and accents, so "bruno fernandes" finds
 * "Bruno Borges Fernandes" and "b.fern" finds "B.Fernandes".
 */
export function matchesPlayerSearch(
  player: Pick<PlayerRow, "name" | "fullName">,
  query: string,
): boolean {
  const words = foldForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = foldForSearch(`${player.name} ${player.fullName}`);
  return words.every((word) => haystack.includes(word));
}

export function buildPlayerRows(
  bootstrap: Pick<Bootstrap, "teams" | "element_types" | "elements">,
): PlayerRow[] {
  const { teams, positions } = lookups(bootstrap);
  return bootstrap.elements.map((e) => {
    const xg = Number(e.expected_goals);
    return {
      id: e.id,
      name: shortName(e),
      fullName: fullName(e),
      team: teams.get(e.team)?.short_name ?? "—",
      position: positions.get(e.element_type)?.singular_name_short ?? "—",
      positionId: e.element_type,
      availability: availabilityOf(e),

      price: toMillions(e.now_cost),
      totalPoints: e.total_points,
      pointsPerGame: Number(e.points_per_game),
      form: Number(e.form),
      selectedByPercent: Number(e.selected_by_percent),
      goals: e.goals_scored,
      assists: e.assists,
      cleanSheets: e.clean_sheets,

      xg,
      xa: Number(e.expected_assists),
      xgi: Number(e.expected_goal_involvements),
      xgPer90: e.expected_goals_per_90,
      xaPer90: e.expected_assists_per_90,
      xgiPer90: e.expected_goal_involvements_per_90,
      goalsMinusXg: round2(e.goals_scored - xg),
      setPieces: setPieceDuties(e),

      defensiveContribution: e.defensive_contribution,
      defensiveContributionPer90: e.defensive_contribution_per_90,
      cbi: e.clearances_blocks_interceptions,
      tackles: e.tackles,
      recoveries: e.recoveries,
      xgcPer90: e.expected_goals_conceded_per_90,
      savesPer90: e.saves_per_90,

      transfersInEvent: e.transfers_in_event,
      transfersOutEvent: e.transfers_out_event,
      netTransfersEvent: e.transfers_in_event - e.transfers_out_event,
      priceChangeEvent: toMillions(e.cost_change_event),
      priceChangeStart: toMillions(e.cost_change_start),

      minutes: e.minutes,
      starts: e.starts,
      bonus: e.bonus,
      bps: e.bps,
    };
  });
}

/**
 * One gameweek of a player's season. A double gameweek's matches are added
 * together; price, ownership and net transfers are per gameweek, so they come
 * from the gameweek's last match.
 */
export interface PlayerGameweek {
  gameweek: number;
  points: number;
  minutes: number;
  goals: number;
  assists: number;
  xg: number;
  xa: number;
  bonus: number;
  bps: number;
  defensiveContribution: number;
  /** Price in £m that gameweek. */
  price: number;
  /** FPL managers who owned the player that gameweek (a count). */
  selected: number;
  /** Transfers in minus out before that gameweek's deadline. */
  transfersBalance: number;
}

export function buildPlayerGameweeks(summary: ElementSummary | undefined): PlayerGameweek[] {
  const matches = [...(summary?.history ?? [])].sort(
    (a, b) =>
      a.round - b.round ||
      (a.kickoff_time ?? "").localeCompare(b.kickoff_time ?? "") ||
      a.fixture - b.fixture,
  );
  const byGameweek = new Map<number, PlayerGameweek>();
  for (const h of matches) {
    const prev = byGameweek.get(h.round);
    byGameweek.set(h.round, {
      gameweek: h.round,
      points: (prev?.points ?? 0) + h.total_points,
      minutes: (prev?.minutes ?? 0) + h.minutes,
      goals: (prev?.goals ?? 0) + h.goals_scored,
      assists: (prev?.assists ?? 0) + h.assists,
      xg: round2((prev?.xg ?? 0) + Number(h.expected_goals)),
      xa: round2((prev?.xa ?? 0) + Number(h.expected_assists)),
      bonus: (prev?.bonus ?? 0) + h.bonus,
      bps: (prev?.bps ?? 0) + h.bps,
      defensiveContribution: (prev?.defensiveContribution ?? 0) + h.defensive_contribution,
      price: toMillions(h.value),
      selected: h.selected,
      transfersBalance: h.transfers_balance,
    });
  }
  return [...byGameweek.values()];
}

export interface PlayerDetail {
  id: number;
  name: string;
  teamName: string;
  teamCode: number;
  position: string;
  positionId: number;
  price: number;
  availability: Availability | null;
  setPieces: SetPieceDuty[];
  stats: Pick<
    Element,
    | "total_points"
    | "points_per_game"
    | "form"
    | "selected_by_percent"
    | "goals_scored"
    | "assists"
    | "expected_goals"
    | "expected_assists"
    | "expected_goal_involvements"
    | "clean_sheets"
    | "goals_conceded"
    | "saves"
    | "expected_goals_conceded"
    | "defensive_contribution"
    | "defensive_contribution_per_90"
    | "yellow_cards"
    | "red_cards"
    | "own_goals"
    | "penalties_missed"
    | "influence"
    | "creativity"
    | "threat"
    | "ict_index"
    | "minutes"
    | "starts"
    | "bonus"
    | "bps"
  > & {
    /** Goals scored minus expected goals. */
    goalsMinusXg: number;
    /** Price change in £m since the season started. */
    priceChangeStart: number;
  };
  /** Per-gameweek history for the charts, in gameweek order. */
  history: PlayerGameweek[];
}

export function buildPlayerDetail(
  bootstrap: Pick<Bootstrap, "teams" | "element_types">,
  element: Element,
  summary: ElementSummary | undefined,
): PlayerDetail {
  const { teams, positions } = lookups(bootstrap);

  return {
    id: element.id,
    name: fullName(element),
    teamName: teams.get(element.team)?.name ?? "—",
    teamCode: element.team_code,
    position: positions.get(element.element_type)?.singular_name ?? "—",
    positionId: element.element_type,
    price: toMillions(element.now_cost),
    availability: availabilityOf(element),
    setPieces: setPieceDuties(element),
    stats: {
      total_points: element.total_points,
      points_per_game: element.points_per_game,
      form: element.form,
      selected_by_percent: element.selected_by_percent,
      goals_scored: element.goals_scored,
      assists: element.assists,
      expected_goals: element.expected_goals,
      expected_assists: element.expected_assists,
      expected_goal_involvements: element.expected_goal_involvements,
      clean_sheets: element.clean_sheets,
      goals_conceded: element.goals_conceded,
      saves: element.saves,
      expected_goals_conceded: element.expected_goals_conceded,
      defensive_contribution: element.defensive_contribution,
      defensive_contribution_per_90: element.defensive_contribution_per_90,
      yellow_cards: element.yellow_cards,
      red_cards: element.red_cards,
      own_goals: element.own_goals,
      penalties_missed: element.penalties_missed,
      influence: element.influence,
      creativity: element.creativity,
      threat: element.threat,
      ict_index: element.ict_index,
      minutes: element.minutes,
      starts: element.starts,
      bonus: element.bonus,
      bps: element.bps,
      goalsMinusXg: round2(element.goals_scored - Number(element.expected_goals)),
      priceChangeStart: toMillions(element.cost_change_start),
    },
    history: buildPlayerGameweeks(summary),
  };
}

// ─── Site metadata ──────────────────────────────────────────────────────────

export interface Health {
  generatedAt: string;
  currentGameweek: number | null;
  nextGameweek: number | null;
  players: number;
}

export function buildHealth(snapshot: Snapshot): Health {
  const { events, elements } = snapshot.bootstrap;
  return {
    generatedAt: snapshot.generatedAt,
    currentGameweek: currentGameweek(events),
    nextGameweek: events.find((e) => e.is_next)?.id ?? null,
    players: elements.length,
  };
}

const updatedFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: UK_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "21 Nov 2026, 17:20 UK time". Fixed to UK time so builds are reproducible. */
export function formatUpdatedAt(iso: string): string {
  return `${updatedFormat.format(new Date(iso))} UK time`;
}
