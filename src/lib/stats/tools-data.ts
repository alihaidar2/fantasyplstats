// Build-time encoder for /tools/data.json: the snapshot cut down to what the
// planner and the comparison need. Server-only in practice (the route handler
// calls it); framework-free like src/lib/fpl so it can be tested directly.

import type { Snapshot } from "../fpl/snapshot-schema";
import { buildFixtureMatrix, foldForSearch } from "../fpl/transforms";
import { seasonOf } from "../recap/context";
import { PLAYER_FIELDS, TOOLS_DATA_VERSION, type FixtureTuple, type PlayerTuple, type ToolsDataFile } from "./tools";

/** How many gameweeks of fixtures the tools show. */
export const TOOLS_FIXTURE_WEEKS = 6;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The gameweeks from the next deadline on, at most `count`. Empty once the
 * season's last deadline has passed: the planner is for the next deadline,
 * and there isn't one.
 */
export function upcomingGameweeks(events: Snapshot["bootstrap"]["events"], count = TOOLS_FIXTURE_WEEKS): number[] {
  const next = events.find((e) => e.is_next)?.id;
  if (next === undefined) return [];
  const last = Math.max(...events.map((e) => e.id));
  return Array.from({ length: Math.min(count, last - next + 1) }, (_, i) => next + i);
}

/** Drops trailing fields at their default (available, no chance, no news) to keep the file small. */
function trimTuple(t: PlayerTuple): PlayerTuple {
  const out = [...t];
  const defaults: unknown[] = [];
  defaults[20] = "a";
  defaults[21] = null;
  defaults[22] = "";
  while (out.length > 20 && out[out.length - 1] === defaults[out.length - 1]) out.pop();
  return out as PlayerTuple;
}

export function buildToolsData(snapshot: Snapshot): ToolsDataFile {
  const { bootstrap, fixtures } = snapshot;
  const gameweeks = upcomingGameweeks(bootstrap.events);

  // Reuse the fixture matrix (it handles doubles, blanks and kickoff order),
  // then map its short names back to ids, which are shorter in the file.
  const idByShort = new Map(bootstrap.teams.map((t) => [t.short_name, t.id]));
  const matrix = buildFixtureMatrix(bootstrap, fixtures);
  const fixturesByTeam: Record<string, FixtureTuple[][]> = {};
  for (const row of matrix.rows) {
    const id = idByShort.get(row.team);
    if (id === undefined) continue;
    fixturesByTeam[String(id)] = gameweeks.map((gw) =>
      (row.weeks[gw - 1] ?? []).map((f): FixtureTuple => [
        idByShort.get(f.opponent) ?? 0,
        f.home ? 1 : 0,
        f.difficulty,
      ]),
    );
  }

  const players = bootstrap.elements.map((e) => {
    const fullName = `${e.first_name} ${e.second_name}`.trim();
    const name = e.web_name.trim() || fullName;
    return trimTuple([
      e.id,
      name,
      // Search matches the short or full name; skip the full name when it adds nothing.
      foldForSearch(fullName) === foldForSearch(name) ? "" : fullName,
      e.team,
      e.element_type,
      e.now_cost,
      e.total_points,
      Number(e.form),
      Number(e.selected_by_percent),
      e.minutes,
      e.starts,
      e.goals_scored,
      e.assists,
      round2(Number(e.expected_goals)),
      round2(Number(e.expected_assists)),
      round2(Number(e.expected_goal_involvements)),
      e.bonus,
      e.defensive_contribution,
      e.clean_sheets,
      e.saves,
      e.status,
      e.chance_of_playing_next_round,
      e.news,
    ]);
  });

  return {
    v: TOOLS_DATA_VERSION,
    generatedAt: snapshot.generatedAt,
    season: seasonOf(snapshot),
    gameweeks,
    teams: [...bootstrap.teams]
      .sort((a, b) => a.short_name.localeCompare(b.short_name))
      .map((t) => [t.id, t.short_name, t.name]),
    fixtures: fixturesByTeam,
    fields: PLAYER_FIELDS,
    players,
  };
}
