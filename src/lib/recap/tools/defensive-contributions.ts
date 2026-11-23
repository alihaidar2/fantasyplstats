import { z } from "zod";
import type { ContextPlayer } from "../context";
import { defineTool } from "./tool";
import { label, limitInput, positionInput, seasonTotals, topBy } from "./shared";

/** FPL points a player earned this gameweek from defensive contributions. */
const earnedPoints = (player: ContextPlayer) =>
  player.gw.breakdown.reduce(
    (sum, part) =>
      sum + part.lines.filter((l) => l.stat === "defensive_contribution").reduce((s, l) => s + l.points, 0),
    0,
  );

export const defensiveContributions = defineTool({
  name: "defensive_contributions",
  description:
    "Who did the defensive work this gameweek: the leaders for defensive contributions (clearances, blocks and " +
    "interceptions, tackles and recoveries), the FPL points each earned from them, how many players earned " +
    "defensive-contribution points at all, and the season leaders so far. Optionally one position only. Season " +
    "figures stop at this gameweek. It can't say how a contribution came about, only the counts.",
  input: z.object({
    limit: limitInput(5),
    position: positionInput.optional(),
  }),
  run(context, input) {
    const pool = context.players.filter((p) => !input.position || p.position === input.position);

    const gameweekLeaders = topBy(
      pool.filter((p) => p.gw.defensiveContribution > 0),
      (p) => p.gw.defensiveContribution,
      input.limit,
      (p) => p.id,
    ).map((p) => ({
      ...label(context, p),
      defensiveContribution: p.gw.defensiveContribution,
      clearancesBlocksInterceptions: p.gw.clearancesBlocksInterceptions,
      tackles: p.gw.tackles,
      recoveries: p.gw.recoveries,
      earnedPoints: earnedPoints(p),
      points: p.gw.points,
    }));

    const seasonLeaders = topBy(
      pool.map((p) => ({ player: p, totals: seasonTotals(p) })).filter((x) => x.totals.defensiveContribution > 0),
      (x) => x.totals.defensiveContribution,
      input.limit,
      (x) => x.player.id,
    ).map((x) => ({
      ...label(context, x.player),
      defensiveContribution: x.totals.defensiveContribution,
      gameweeksPlayed: x.totals.gameweeksPlayed,
    }));

    return {
      gameweek: context.gameweek,
      ...(input.position ? { position: input.position } : {}),
      earnedPointsCount: pool.filter((p) => earnedPoints(p) > 0).length,
      gameweekLeaders,
      seasonLeaders,
    };
  },
});
