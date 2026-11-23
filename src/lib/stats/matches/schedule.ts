// The double and blank gameweek planner (/fixtures/schedule/): for every
// gameweek still to come, which clubs play twice (or more) and which don't
// play, and a grid of how many matches each club has per gameweek.

import type { Snapshot } from "../../fpl";
import { formatKickoff, hasStarted, teamRefs, type TeamRef } from "./shared";

export interface PlannerFixture {
  opponent: string;
  home: boolean;
}

export interface PlannerTeamWeek {
  team: TeamRef;
  fixtures: PlannerFixture[];
}

export interface PlannerWeek {
  gameweek: number;
  deadline: string | null;
  /** Matches scheduled in the gameweek. */
  matches: number;
  /** Clubs with two or more matches, most first, then by name. */
  doubles: PlannerTeamWeek[];
  /** Clubs with no match, by name. */
  blanks: TeamRef[];
}

export interface PlannerRow {
  team: TeamRef;
  /** Fixtures per upcoming gameweek, in the order of `SchedulePlanner.gameweeks`. */
  weeks: PlannerFixture[][];
  /** Matches left in the upcoming gameweeks (postponed ones not counted). */
  total: number;
  doubles: number;
  blanks: number;
}

export interface PostponedFixture {
  id: number;
  home: TeamRef;
  away: TeamRef;
}

export interface SchedulePlanner {
  /** Gameweeks that haven't started, oldest first. Empty once the last gameweek has started. */
  gameweeks: number[];
  weeks: PlannerWeek[];
  /** One row per club, by short name (as the fixture matrix). */
  rows: PlannerRow[];
  /** Fixtures with no gameweek yet: FPL will move each into a gameweek, often making a double. */
  postponed: PostponedFixture[];
  /** Whether any upcoming gameweek has a double or a blank. */
  hasDoublesOrBlanks: boolean;
}

const byName = (a: TeamRef, b: TeamRef) => a.name.localeCompare(b.name);

/** The planner for every gameweek that hasn't started yet. */
export function buildSchedulePlanner(snapshot: Pick<Snapshot, "bootstrap" | "fixtures">): SchedulePlanner {
  const { bootstrap, fixtures } = snapshot;
  const team = teamRefs(bootstrap);
  const upcoming = bootstrap.events
    .filter((e) => !hasStarted(e, fixtures))
    .sort((a, b) => a.id - b.id);
  const gameweeks = upcoming.map((e) => e.id);
  const column = new Map(gameweeks.map((gw, i) => [gw, i]));

  // Rows in short-name order, as the fixture difficulty matrix lists clubs.
  const teams = bootstrap.teams.map((t) => team(t.id)).sort((a, b) => a.short.localeCompare(b.short));
  const weeksByTeam = new Map(teams.map((t) => [t.id, gameweeks.map((): PlannerFixture[] => [])]));
  const matchesPerWeek = gameweeks.map(() => 0);

  const scheduled = fixtures
    .filter((f) => f.event !== null && column.has(f.event))
    .sort((a, b) => (a.kickoff_time ?? "9999").localeCompare(b.kickoff_time ?? "9999") || a.id - b.id);
  for (const f of scheduled) {
    const col = column.get(f.event!)!;
    matchesPerWeek[col]++;
    weeksByTeam.get(f.team_h)?.[col].push({ opponent: team(f.team_a).short, home: true });
    weeksByTeam.get(f.team_a)?.[col].push({ opponent: team(f.team_h).short, home: false });
  }

  const rows: PlannerRow[] = teams.map((t) => {
    const weeks = weeksByTeam.get(t.id)!;
    return {
      team: t,
      weeks,
      total: weeks.reduce((n, w) => n + w.length, 0),
      doubles: weeks.filter((w) => w.length > 1).length,
      blanks: weeks.filter((w) => w.length === 0).length,
    };
  });

  const weeks: PlannerWeek[] = upcoming.map((e, col) => ({
    gameweek: e.id,
    deadline: e.deadline_time ? formatKickoff(e.deadline_time) : null,
    matches: matchesPerWeek[col],
    doubles: rows
      .filter((r) => r.weeks[col].length > 1)
      .sort((a, b) => b.weeks[col].length - a.weeks[col].length || byName(a.team, b.team))
      .map((r) => ({ team: r.team, fixtures: r.weeks[col] })),
    blanks: rows.filter((r) => r.weeks[col].length === 0).map((r) => r.team),
  }));

  const postponed = fixtures
    .filter((f) => f.event === null && !f.finished)
    .sort((a, b) => a.id - b.id)
    .map((f) => ({ id: f.id, home: team(f.team_h), away: team(f.team_a) }));

  return {
    gameweeks,
    weeks,
    rows,
    postponed,
    hasDoublesOrBlanks: weeks.some((w) => w.doubles.length > 0 || w.blanks.length > 0),
  };
}
