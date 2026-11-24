import { z } from "zod";
import { defineTool } from "./tool";
import { chipRows, defensiveRecords, label, limitInput, matchFact, seasonTotals, topBy, transfersMadeFact } from "./shared";

export const seasonRecords = defineTool({
  name: "season_records",
  description:
    "This gameweek against the season so far: the average and highest manager score of every gameweek to date, " +
    "the best single-gameweek player scores, the season's leaders for points, goals and assists, the biggest " +
    "wins, goals per gameweek, chips played, transfers made, and defensive contributions (the gameweek's total and " +
    "the best single-player gameweek). Flags tell you whether this gameweek set a new season high (or low) for each; equalling the previous best does not count. " +
    "Use it before calling anything a record or a season best. Everything stops at this gameweek, and there are " +
    "no records from earlier seasons.",
  input: z.object({ limit: limitInput(5, 10) }),
  run(context, input) {
    const { gameweek } = context;
    const several = context.gameweekScores.length > 1;
    // "So far" flags compare with the earlier gameweeks only, and a tie is not a new high or low.
    const earlierAverages = context.gameweekScores.filter((g) => g.gameweek < gameweek).map((g) => g.averageScore);
    const thisAverage = context.event.averageScore;

    const scores = context.players.flatMap((player) =>
      player.rounds.map((round) => ({ player, gameweek: round.gameweek, points: round.points })),
    );
    const highestIndividualScores = topBy(scores, (s) => s.points, input.limit, (s) => s.gameweek * 10_000 + s.player.id).map(
      (s) => ({ ...label(context, s.player), points: s.points, gameweek: s.gameweek }),
    );
    const bestBefore = Math.max(0, ...scores.filter((s) => s.gameweek < gameweek).map((s) => s.points));
    const bestNow = Math.max(0, ...scores.filter((s) => s.gameweek === gameweek).map((s) => s.points));

    const totals = context.players.map((player) => ({ player, totals: seasonTotals(player) }));
    const leaders = (stat: "points" | "goals" | "assists") =>
      topBy(
        totals.filter((t) => t.totals[stat] > 0),
        (t) => t.totals[stat],
        input.limit,
        (t) => t.player.id,
      ).map((t) => ({ ...label(context, t.player), [stat]: t.totals[stat] }));

    const margin = (m: { homeScore: number | null; awayScore: number | null }) =>
      Math.abs((m.homeScore ?? 0) - (m.awayScore ?? 0));
    const wins = context.results.filter((m) => margin(m) > 0);
    const biggestWins = topBy(
      wins,
      (m) => margin(m) * 100 + (m.homeScore ?? 0) + (m.awayScore ?? 0),
      Math.min(input.limit, 3),
      (m) => m.gameweek * 10_000 + m.fixtureId,
    ).map((m) => ({ ...matchFact(context, m), gameweek: m.gameweek, margin: margin(m) }));
    const biggestBefore = Math.max(0, ...wins.filter((m) => m.gameweek < gameweek).map(margin));
    const biggestNow = Math.max(0, ...wins.filter((m) => m.gameweek === gameweek).map(margin));

    const goals = new Map<number, { gameweek: number; matches: number; goals: number }>();
    for (const m of context.results) {
      const row = goals.get(m.gameweek) ?? { gameweek: m.gameweek, matches: 0, goals: 0 };
      row.matches += 1;
      row.goals += (m.homeScore ?? 0) + (m.awayScore ?? 0);
      goals.set(m.gameweek, row);
    }
    const goalsPerGameweek = [...goals.values()].sort((a, b) => a.gameweek - b.gameweek);
    const goalsNow = goals.get(gameweek)?.goals ?? 0;
    const goalsBefore = Math.max(0, ...goalsPerGameweek.filter((g) => g.gameweek < gameweek).map((g) => g.goals));

    const defence = defensiveRecords(context);
    const transfers = transfersMadeFact(context);

    return {
      gameweek,
      ...(several ? {} : { note: "The first gameweek of the season: there is nothing earlier to compare it with." }),
      managerScores: {
        byGameweek: context.gameweekScores.map((g) => ({
          gameweek: g.gameweek,
          averageScore: g.averageScore,
          ...(g.highestScore !== null ? { highestScore: g.highestScore } : {}),
        })),
        ...(several
          ? {
              thisAverageIsTheHighestSoFar: thisAverage > Math.max(...earlierAverages),
              thisAverageIsTheLowestSoFar: thisAverage < Math.min(...earlierAverages),
            }
          : {}),
      },
      highestIndividualScores,
      ...(several ? { thisGameweekHasTheBestScoreSoFar: bestNow > bestBefore } : {}),
      seasonLeaders: {
        points: leaders("points"),
        goals: leaders("goals"),
        assists: leaders("assists"),
      },
      biggestWins,
      ...(several ? { thisGameweekHasTheBiggestWinSoFar: biggestNow > biggestBefore } : {}),
      goalsPerGameweek,
      ...(several ? { thisGameweekHasTheMostGoalsSoFar: goalsNow > goalsBefore } : {}),
      // The share of managers and the previous high for each chip are in captaincy.
      chipsThisGameweek: chipRows(context).map((c) => ({
        chip: c.chip,
        played: c.played,
        ...(c.mostPlayedInAGameweekSoFar === undefined ? {} : { mostPlayedInAGameweekSoFar: c.mostPlayedInAGameweekSoFar }),
      })),
      ...(transfers ? { transfers } : {}),
      defensiveContributions: {
        thisGameweek: { defensiveContribution: defence.totalNow },
        ...(defence.previousHigh
          ? { mostInAGameweekSoFar: defence.mostSoFar, previousHigh: defence.previousHigh }
          : {}),
        ...(defence.bestNow
          ? { bestIndividualThisGameweek: { ...label(context, defence.bestNow.player), defensiveContribution: defence.bestNow.defensiveContribution } }
          : {}),
        ...(defence.bestBefore
          ? {
              bestIndividualThisGameweekIsTheSeasonHigh: defence.bestIndividualSoFar,
              bestIndividualBefore: {
                ...label(context, defence.bestBefore.player),
                gameweek: defence.bestBefore.gameweek,
                defensiveContribution: defence.bestBefore.defensiveContribution,
              },
            }
          : {}),
      },
    };
  },
});
