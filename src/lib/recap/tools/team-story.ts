import { z } from "zod";
import type { GameweekContext, GameweekMatch } from "../context";
import { defineTool } from "./tool";
import { label, leagueTable, matchFact, matchesOf, resolveTeam, teamInput, topBy } from "./shared";

/** How many of the club's most recent results in a row (newest last) satisfy `test`. */
function runOf(results: readonly string[], test: (result: string) => boolean): number {
  let run = 0;
  for (let i = results.length - 1; i >= 0 && test(results[i]); i--) run++;
  return run;
}

/** The club's results of the season so far as W, D or L, oldest first. */
function resultsOf(context: GameweekContext, teamId: number): string[] {
  return context.results
    .filter((m) => m.homeId === teamId || m.awayId === teamId)
    .map((m) => {
      const scored = m.homeId === teamId ? m.homeScore! : m.awayScore!;
      const conceded = m.homeId === teamId ? m.awayScore! : m.homeScore!;
      return scored > conceded ? "W" : scored === conceded ? "D" : "L";
    });
}

export const teamStory = defineTool({
  name: "team_story",
  description:
    "One club's gameweek and season so far: its result(s) with its scorers and assisters and whether it kept a " +
    "clean sheet, its best FPL players this gameweek and the club's total FPL points, its league table row after " +
    "this gameweek, and its current run of results. Says so when the club had no match (a blank gameweek) or two " +
    "(a double). Players are counted for the club they played for in this gameweek. It knows results and FPL " +
    "points only: nothing about line-ups, tactics or why a result happened.",
  input: z.object({ team: teamInput }),
  run(context, input) {
    const team = resolveTeam(context, input.team);
    const matches = matchesOf(context, team.id);

    const involved = (match: GameweekMatch, stat: string, side: "home" | "away", key: "goals" | "assists" | "ownGoals") =>
      (match.stats[stat] ?? [])
        .filter((s) => s.side === side)
        .map((s) => ({ ...label(context, context.playerById.get(s.playerId)!), [key]: s.value }));

    const results = matches.map((match) => {
      const side = match.homeId === team.id ? "home" : "away";
      const other = side === "home" ? "away" : "home";
      const conceded = side === "home" ? match.awayScore : match.homeScore;
      const scorers = involved(match, "goals_scored", side, "goals");
      const assisters = involved(match, "assists", side, "assists");
      const ownGoalsByOpponent = involved(match, "own_goals", other, "ownGoals");
      return {
        ...matchFact(context, match),
        venue: side,
        ...(match.finished ? {} : { note: "Not finished." }),
        ...(conceded !== null ? { cleanSheet: conceded === 0 } : {}),
        ...(scorers.length ? { scorers } : {}),
        ...(assisters.length ? { assisters } : {}),
        ...(ownGoalsByOpponent.length ? { ownGoalsByOpponent } : {}),
      };
    });

    const squad = context.players.filter((p) => p.teamId === team.id);
    const topPlayers = topBy(
      squad.filter((p) => p.gw.minutes > 0),
      (p) => p.gw.points,
      3,
      (p) => p.id,
    ).map((p) => ({ ...label(context, p), points: p.gw.points, goals: p.gw.goals, assists: p.gw.assists }));

    const row = leagueTable(context).find((r) => r.teamId === team.id);
    const season = resultsOf(context, team.id);
    const run = {
      winsInARow: runOf(season, (r) => r === "W"),
      unbeatenInARow: runOf(season, (r) => r !== "L"),
      winlessInARow: runOf(season, (r) => r !== "W"),
      defeatsInARow: runOf(season, (r) => r === "L"),
    };

    return {
      team: team.name,
      gameweek: context.gameweek,
      ...(matches.length === 0
        ? { note: "A blank gameweek: this club had no match." }
        : matches.length > 1
          ? { note: "A double gameweek: this club played more than once." }
          : {}),
      ...(results.length ? { matches: results } : {}),
      fantasyPoints: {
        clubTotal: squad.reduce((sum, p) => sum + p.gw.points, 0),
        ...(topPlayers.length ? { topPlayers } : {}),
      },
      ...(row
        ? {
            table: {
              position: row.position,
              played: row.played,
              won: row.won,
              drawn: row.drawn,
              lost: row.lost,
              goalsFor: row.goalsFor,
              goalsAgainst: row.goalsAgainst,
              points: row.points,
              ...(row.form ? { form: row.form } : {}),
            },
          }
        : {}),
      ...(season.length ? { currentRun: run } : {}),
    };
  },
});
