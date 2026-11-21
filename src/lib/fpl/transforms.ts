// Turn validated FPL data into the slim view models the pages render.

import { UK_TIME_ZONE } from "./schedule";
import type {
  Bootstrap,
  Element,
  ElementSummary,
  FplEvent,
  Fixture,
  Snapshot,
} from "./schemas";

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

export interface PlayerRow {
  id: number;
  name: string;
  team: string;
  position: string;
  positionId: number;
  price: number;
  totalPoints: number;
  pointsPerGame: number;
  form: number;
  selectedByPercent: number;
  goals: number;
  assists: number;
  cleanSheets: number;
}

function lookups(bootstrap: Pick<Bootstrap, "teams" | "element_types">) {
  const teams = new Map(bootstrap.teams.map((t) => [t.id, t]));
  const positions = new Map(bootstrap.element_types.map((p) => [p.id, p]));
  return { teams, positions };
}

const fullName = (e: Element) => `${e.first_name} ${e.second_name}`.trim() || e.web_name;

export function buildPlayerRows(
  bootstrap: Pick<Bootstrap, "teams" | "element_types" | "elements">,
): PlayerRow[] {
  const { teams, positions } = lookups(bootstrap);
  return bootstrap.elements.map((e) => ({
    id: e.id,
    name: fullName(e),
    team: teams.get(e.team)?.short_name ?? "—",
    position: positions.get(e.element_type)?.singular_name_short ?? "—",
    positionId: e.element_type,
    price: e.now_cost / 10,
    totalPoints: e.total_points,
    pointsPerGame: Number(e.points_per_game),
    form: Number(e.form),
    selectedByPercent: Number(e.selected_by_percent),
    goals: e.goals_scored,
    assists: e.assists,
    cleanSheets: e.clean_sheets,
  }));
}

export interface PointsByGameweek {
  gameweek: number;
  points: number;
}

export interface PlayerDetail {
  id: number;
  name: string;
  teamName: string;
  teamCode: number;
  position: string;
  positionId: number;
  price: number;
  status: string;
  news: string;
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
    | "clean_sheets"
    | "goals_conceded"
    | "saves"
    | "expected_goals_conceded"
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
  >;
  /** Points per gameweek, with a double gameweek's matches added together. */
  history: PointsByGameweek[];
}

export function buildPlayerDetail(
  bootstrap: Pick<Bootstrap, "teams" | "element_types">,
  element: Element,
  summary: ElementSummary | undefined,
): PlayerDetail {
  const { teams, positions } = lookups(bootstrap);
  const byGameweek = new Map<number, number>();
  for (const h of summary?.history ?? []) {
    byGameweek.set(h.round, (byGameweek.get(h.round) ?? 0) + h.total_points);
  }

  return {
    id: element.id,
    name: fullName(element),
    teamName: teams.get(element.team)?.name ?? "—",
    teamCode: element.team_code,
    position: positions.get(element.element_type)?.singular_name ?? "—",
    positionId: element.element_type,
    price: element.now_cost / 10,
    status: element.status,
    news: element.news,
    stats: {
      total_points: element.total_points,
      points_per_game: element.points_per_game,
      form: element.form,
      selected_by_percent: element.selected_by_percent,
      goals_scored: element.goals_scored,
      assists: element.assists,
      expected_goals: element.expected_goals,
      expected_assists: element.expected_assists,
      clean_sheets: element.clean_sheets,
      goals_conceded: element.goals_conceded,
      saves: element.saves,
      expected_goals_conceded: element.expected_goals_conceded,
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
    },
    history: [...byGameweek]
      .sort(([a], [b]) => a - b)
      .map(([gameweek, points]) => ({ gameweek, points })),
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
